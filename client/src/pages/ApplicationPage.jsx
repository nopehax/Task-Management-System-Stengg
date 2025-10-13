import React, { useEffect } from 'react';
import HeaderPage from '../components/Header';
import { useAuth } from '../utils/authContext';

const ApplicationPage = () => {
	const { isAuthenticated } = useAuth();
	useEffect(() => {
		console.log('isAuthenticated:', isAuthenticated);
	}, [isAuthenticated]);

	return (
		<div>
			<HeaderPage />
			<h1>Applications</h1>
			<p>Welcome to the protected Applications page!</p>
		</div>
	);
};

export default ApplicationPage;