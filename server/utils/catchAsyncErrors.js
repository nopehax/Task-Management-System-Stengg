module.exports = func => (req, res, next) => 
    Promise.resolve(FUNC(req, res, next))
                .catch(next)
