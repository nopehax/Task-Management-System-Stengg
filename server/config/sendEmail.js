const nodemailer = require("nodemailer");
const { pool } = require("./db");

// get ethereal creds from env.
const ETHEREAL_USER = process.env.ETHEREAL_USER;
const ETHEREAL_PASS = process.env.ETHEREAL_PASS;

const mailer = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  secure: false,
  auth: {
    user: ETHEREAL_USER,
    pass: ETHEREAL_PASS,
  },
});

const triggerEmailSend = async (taskId, username) => {
  // 1. load application to get App_permit_Done
  const appAcronym = taskId.split("_")[0];
  const [apps] = await pool.query(
    `SELECT App_permit_Done FROM applications WHERE App_Acronym = ?`,
    [appAcronym]
  );
  if (!apps.length) {
    throw new Error(`Application ${appAcronym} not found`);
  }

  let permitCreate = [];
  try {
    const raw = apps[0].App_permit_Create;
    permitCreate = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {
    permitCreate = [];
  }

  if (!permitCreate.length) {
    throw new Error(`No userGroups are permitted as project lead in Application ${appAcronym}`);
  }

  // 2. get all accounts (since we don't have a userGroup→users table)
  const [accounts] = await pool.query(
    `SELECT username, email, userGroups FROM accounts`
  );

  // 3. filter accounts whose userGroups overlap with permitCreate
  const targetEmails = new Set();

  for (const acc of accounts) {
    if (!acc.email) continue;

    let userGroups = [];
    try {
      userGroups = Array.isArray(acc.userGroups)
        ? acc.userGroups
        : JSON.parse(acc.userGroups || "[]");
    } catch {
      userGroups = [];
    }

    // check overlap
    const hasGroup = userGroups.some((g) => permitCreate.includes(g));
    if (hasGroup) {
      targetEmails.add(acc.email);
    }
  }

  if (targetEmails.size === 0) {
    throw new Error("There are no users/emails in the permitted userGroups");
  }

  // 4. send mail
  const toList = Array.from(targetEmails).join(", ");

  const info = await mailer.sendMail({
    from: `"Task Management System" <${ETHEREAL_USER}>`,
    to: toList,
    subject: `New task for review: ${taskId}`,
    text: `The task ${taskId} has just been marked for review by ${username}. Please log in to the Task Management System to approve/reject the task.`,
    html: `<p>The task (<b>${taskId}</b>) has just been marked for review by <b>${username}</b>. Please log in to the Task Management System to approve/reject the task.</p>`,
  });

  // you can log the preview URL in dev
  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
};

module.exports = {
  triggerEmailSend,
};
