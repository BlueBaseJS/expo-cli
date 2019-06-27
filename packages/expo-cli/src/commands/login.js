/**
 * @flow
 */

import { login } from '../accounts';

export default (program: any) => {
  program
    .command('login')
    .alias('signin')
    .description('Login with your Expo account')
    .option('-u, --username [string]', 'Username')
    .option('-p, --password [string]', 'Password')
    .option('-g, --generate-session [path]', 'Generate user session file')
    .option('-s, --session <path>', 'Login with user session file')
    .asyncAction(login);
};
