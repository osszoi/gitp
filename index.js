#!/usr/bin/env node

const { Command } = require('commander');
const OpenAI = require('openai');
const simpleGit = require('simple-git');
const logger = require('./log');
const inquirer = require('inquirer').default;
const { query } = require('llm-querier');

// Load API key from environment variables or a config file
const { loadCredentials, saveCredentials } = require('@edjl/config');

const credentials = loadCredentials('gitp');

const git = simpleGit();

// Extract Jira/GitHub/GitLab ticket from the branch name
function extractTicketFromBranch(branchName) {
	const match = branchName.match(
		/(?:feature|bugfix|hotfix|release)\/([A-Za-z]+-\d+)/
	);

	// Current path
	const currentPath = process.cwd();
	const defaultTicketFor =
		(credentials.defaultTicketFor || []).find((item) =>
			currentPath.includes(item.path)
		)?.ticket || '';

	return match ? match[1] : defaultTicketFor;
}

async function generateCommit(diff, ticket, history = []) {
	const provider = credentials.provider;
	const model = credentials.model;
	const apiKey = credentials.apiKey;

	if (!provider) {
		logger('[red]❌ No provider selected.');
		return {};
	}

	if (!apiKey) {
		logger('[red]❌ No API key provided.');
		return {};
	}

	if (!model) {
		logger('[red]❌ No model selected.');
		return {};
	}

	let historyContext = '';
	if (history.length > 0) {
		historyContext = '\n\n# Previous attempts and feedback:\n';
		history.forEach((attempt, index) => {
			historyContext += `\nAttempt ${index + 1}:\n`;
			historyContext += `Message: ${attempt.message}\n`;
			historyContext += `Description: ${attempt.description}\n`;
			historyContext += `User feedback: ${attempt.feedback}\n`;
		});
	}

	const result = await query({
		model,
		provider,
		apiKey,
		prompt: `
			# Task
			Generate a commit message and a commit description for code changes

			# How to
			Use the provided context to generate the commit message and description. In the context section you will find the diff of the changes.

			# CRITICAL Requirements
			- DO NOT use conventional commit prefixes like "feat:", "fix:", "chore:", "docs:", "style:", "refactor:", "test:", "build:", etc.
			- Start the commit message directly with the action verb (e.g., "Add", "Update", "Fix", "Implement", "Refactor")
			- Write as a SENIOR DEVELOPER would - professional, concise, and technically accurate
			- The commit message should be very short and straight to the point (max 50 characters)
			- The commit description should provide meaningful technical context about WHY the changes were made, not just WHAT was changed
			- AVOID stating obvious file changes like "updated package.json" or "modified index.js"
			- Focus on the business logic, architectural decisions, or problem being solved
			- Think about what a developer reading this commit in 6 months would need to know

			# Format
			The output format should consist of two lines, prefixed with "COMMIT_MESSAGE" for the commit message and "COMMIT_DESCRIPTION" for the commit description, like this:
			COMMIT_MESSAGE: <commit message here>
			COMMIT_DESCRIPTION: <commit description here>${historyContext}
		`,
		context: [diff],
		examples: [
			`
				COMMIT_MESSAGE: Implement async request batching for API calls
				COMMIT_DESCRIPTION: Reduces server load by combining multiple API requests into batched operations. This architectural change improves performance by 40% during peak usage and prevents rate limiting issues encountered in production.
			`,
			`
				COMMIT_MESSAGE: Fix memory leak in event listener cleanup
				COMMIT_DESCRIPTION: Event listeners were not being properly removed on component unmount, causing memory consumption to grow over time. Implemented proper cleanup in lifecycle methods to ensure all listeners are detached when components are destroyed.
			`
		]
	});

	const commit = result.split('\n').map((line) => line.trim());

	commitMessage = '';
	commitDescription = '';
	commit.forEach((line) => {
		if (line.startsWith('COMMIT_MESSAGE:')) {
			commitMessage = `${ticket?.length ? `${ticket}: ` : ''}${line
				.replace('COMMIT_MESSAGE:', '')
				.trim()}`;
		} else if (line.startsWith('COMMIT_DESCRIPTION:')) {
			commitDescription = line.replace('COMMIT_DESCRIPTION:', '').trim();
		}
	});

	return { commitMessage, commitDescription };
}

async function commitCommand(cmd) {
	try {
		const isGitRepo = await git.checkIsRepo();
		if (!isGitRepo) {
			logger('[red]❌ This is not a Git repository.');
			return;
		}

		if (cmd.add) {
			await git.add('.');
		}

		const diff = await git.diff(['--cached']); // ['--cached']
		const branch = await git
			.revparse(['--abbrev-ref', 'HEAD'])
			.catch(() => null);
		if (!branch) {
			logger('[red]❌ Unable to get current branch name.');
			return;
		}

		const ticket = extractTicketFromBranch(branch);

		if (!diff.length) {
			logger(
				'[red]❗ No changes to commit. If they are not staged, run [yellow]git add .[red] first or use the [yellow]--add[red] flag.'
			);
			return;
		}

		let userSatisfied = false;
		let finalCommitMessage = '';
		let finalCommitDescription = '';
		let attemptCount = 0;
		const history = [];
		
		while (!userSatisfied && attemptCount < 10) {
			const { commitMessage, commitDescription } = await generateCommit(
				diff,
				ticket,
				history
			);
			if (!commitMessage) return;
			logger(`\n\n[green]Message: [white] ${commitMessage}`);
			logger(`[green]Description: [white] ${commitDescription}`);

			if (cmd.y) {
				finalCommitMessage = commitMessage;
				finalCommitDescription = commitDescription;
				userSatisfied = true;
				break;
			}

			const answers = await inquirer.prompt([
				{
					type: 'input',
					name: 'feedback',
					message: 'Accept? (Press Enter to accept, or provide feedback for improvement):',
					default: ''
				}
			]);

			if (answers.feedback === '') {
				// User pressed Enter without feedback - accept the commit
				finalCommitMessage = commitMessage;
				finalCommitDescription = commitDescription;
				userSatisfied = true;
			} else {
				// User provided feedback - add to history and regenerate
				history.push({
					message: commitMessage,
					description: commitDescription,
					feedback: answers.feedback
				});
				attemptCount++;
			}
		}

		if (!userSatisfied) {
			logger('[yellow]Proceeding with the last generated commit message.');
		}
		if (!finalCommitMessage) return;

		if (cmd.dryRun) {
			logger('[yellow]Dry-run enabled. Skipping commit and push.');
			return;
		}

		let commitArgs = `${finalCommitMessage}\n\n${finalCommitDescription}`;

		if (cmd.verify) {
			commitArgs += ' --no-verify';
		}

		await git.commit(commitArgs);
	} catch (error) {
		logger('❌ Error:', error.message);
	}
}

async function addAliasToGitConfig() {
	const { exec } = require('child_process');

	return new Promise((resolve, reject) => {
		exec('git config --global alias.c "!gitp commit $*"', (error) => {
			if (error) return reject(error);
			exec('git config --global alias.ca "!gitp commit --add $*"', (error) => {
				if (error) return reject(error);
				resolve();
			});
		});
	}).finally(() => {
		logger('[green]✅ Aliases added to git config.');
		logger(
			'[yellow]You can now use [green]git c[yellow] and [green]git ca[yellow] to commit and commit with add respectively.'
		);
	});
}

async function checkForUpdates() {
	try {
		const response = await fetch('https://registry.npmjs.org/git-gpt/latest');
		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`);
		}

		const latestVersion = await response.json();
		return latestVersion.version;
	} catch (error) {
		logger(`[red]❌ Error fetching latest version: ${error.message}`);
	}
}

async function main() {
	const program = new Command();

	// Check if there is a new version
	const latestVersion = await checkForUpdates();
	const currentVersion = require('./package.json').version;

	if (latestVersion && latestVersion !== currentVersion) {
		logger(
			`[yellow]A new version of gitp is available. Please update to the latest version by running [green]npm install -g git-gpt[yellow].`
		);
	}

	program
		.command('commit')
		.option('--dry-run', 'Perform OpenAI request without git operations', false)
		.option('--no-verify', 'Skip git commit hooks', false)
		.option('--add', 'Automatically add changes to the staging area', false)
		.option('-y', 'Skip user confirmation', false)
		.action(commitCommand);

	program
		.command('set-api-key <key>')
		.description('Set the API key')
		.action((apiKey) => {
			saveCredentials('gitp', { ...credentials, apiKey });
		});

	program
		.command('set-default-ticket <ticket>')
		.description('Set the default ticket when no ticket is found')
		.action((ticket) => {
			saveCredentials('gitp', { ...credentials, defaultTicket: ticket });
		});

	program
		.command('set-default-ticket-for <path> <ticket>')
		.description('Set the default ticket for a specific path')
		.action((path, ticket) => {
			const current = credentials.defaultTicketFor || [];
			let final = [];

			if (current.find((item) => item.path === path)) {
				final = current.map((item) => {
					if (item.path === path) {
						return { path, ticket };
					}

					return item;
				});
			} else {
				final = [...current, { path, ticket }];
			}

			saveCredentials('gitp', {
				...credentials,
				defaultTicketFor: final
			});
		});

	program
		.command('set-provider <provider>')
		.description('Set the provider')
		.action((provider) => {
			saveCredentials('gitp', {
				...credentials,
				provider
			});
		});

	program
		.command('set-model <model>')
		.description('Set the model')
		.action((model) => {
			saveCredentials('gitp', {
				...credentials,
				model
			});
		});

	program
		.command('add-alias')
		.description('Add aliases to the git config')
		.action(addAliasToGitConfig);

	program.parse(process.argv);
}

main();
