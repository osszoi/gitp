#!/usr/bin/env node

const { Command } = require('commander');
const OpenAI = require('openai');
const simpleGit = require('simple-git');
const logger = require('./log');
const inquirer = require('inquirer').default;
const { query } = require('llm-querier');
const { gatherSmartContext, extractChangedFiles } = require('./contextGatherer');

// Load API key from environment variables or a config file
const { loadCredentials, saveCredentials } = require('@edjl/config');

const credentials = loadCredentials('gitp');

const git = simpleGit();

// Extract Jira/GitHub/GitLab ticket from the branch name
function extractTicketFromBranch(branchName) {
	const match = branchName.match(
		/(?:feature|bugfix|hotfix|release)\/([A-Za-z0-9]+-\d+)/
	);

	// Current path
	const currentPath = process.cwd();
	const defaultTicketFor =
		(credentials.defaultTicketFor || []).find((item) =>
			currentPath.includes(item.path)
		)?.ticket || '';

	return match ? match[1] : defaultTicketFor;
}

// Check if conventional commits should be used for current path
function shouldUseConventionalCommits() {
	const currentPath = process.cwd();
	const useConventionalCommitsIn = credentials.useConventionalCommitsIn || [];

	return useConventionalCommitsIn.some((item) => {
		try {
			const regex = new RegExp(item.path);
			return regex.test(currentPath);
		} catch (error) {
			// If regex is invalid, fall back to simple string matching
			return currentPath.includes(item.path);
		}
	});
}

async function generateCommit(diff, ticket, history = [], smartMode = false) {
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

	// Prepare context array
	const contextArray = [diff];

	// Add smart context if enabled
	if (smartMode) {
		logger('[cyan]🧠 Gathering smart context...');
		const changedFiles = extractChangedFiles(diff);
		const smartContext = await gatherSmartContext(diff, changedFiles);

		if (smartContext) {
			contextArray.push(smartContext);
		}
	}

	// Check if conventional commits should be used
	const useConventionalCommits = shouldUseConventionalCommits();

	const result = await query({
		model,
		provider,
		apiKey,
		prompt: `
			# Task
			Generate a commit message and a commit description for code changes

			# How to
			Use the provided context to generate the commit message and description. In the context section you will find the diff of the changes${
				smartMode
					? ' and additional smart context about the affected components and their relationships'
					: ''
			}.

			# CRITICAL Requirements
			${
				useConventionalCommits
					? `- MUST use conventional commit format following the npm library @semantic-release standard
			- You must decide which conventional commit type best applies to the changes
			- The commit message should be very short and straight to the point
			- The commit description should provide meaningful technical context about WHY the changes were made, not just WHAT was changed
			- AVOID stating obvious file changes like "updated package.json" or "modified index.js"
			- Focus on the business logic, architectural decisions, or problem being solved
			- Think about what a developer reading this commit in 6 months would need to know
			${
				smartMode
					? '- Use the smart context provided to understand component relationships and architecture'
					: ''
			}`
					: `- DO NOT use conventional commit prefixes like "feat:", "fix:", "chore:", "docs:", "style:", "refactor:", "test:", "build:", etc.
			- Start the commit message directly with the action verb (e.g., "Add", "Update", "Fix", "Implement", "Refactor")
			- Write as a SENIOR DEVELOPER would - professional, concise, and technically accurate
			- The commit message should be very short and straight to the point (max 50 characters)
			- The commit description should provide meaningful technical context about WHY the changes were made, not just WHAT was changed
			- AVOID stating obvious file changes like "updated package.json" or "modified index.js"
			- Focus on the business logic, architectural decisions, or problem being solved
			- Think about what a developer reading this commit in 6 months would need to know
			${
				smartMode
					? '- Use the smart context provided to understand component relationships and architecture'
					: ''
			}`
			}

			# Format
			The output format should consist of two lines, prefixed with "COMMIT_MESSAGE" for the commit message and "COMMIT_DESCRIPTION" for the commit description, like this:
			COMMIT_MESSAGE: <commit message here>
			COMMIT_DESCRIPTION: <commit description here>${historyContext}
		`,
		context: contextArray,
		examples: useConventionalCommits ? [
			`
				COMMIT_MESSAGE: feat: implement async request batching for API calls
				COMMIT_DESCRIPTION: Reduces server load by combining multiple API requests into batched operations. This architectural change improves performance by 40% during peak usage and prevents rate limiting issues encountered in production.
			`,
			`
				COMMIT_MESSAGE: fix: resolve memory leak in event listener cleanup
				COMMIT_DESCRIPTION: Event listeners were not being properly removed on component unmount, causing memory consumption to grow over time. Implemented proper cleanup in lifecycle methods to ensure all listeners are detached when components are destroyed.
			`
		] : [
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
			const message = line.replace('COMMIT_MESSAGE:', '').trim();

			// Handle conventional commits with tickets
			if (useConventionalCommits && ticket?.length) {
				// For conventional commits, add ticket after the type/scope part
				// Example: feat: EXAMPLE-0000 add new feature
				const match = message.match(/^(\w+(?:\([^)]+\))?:)\s*(.+)$/);
				if (match) {
					commitMessage = `${match[1]} ${ticket} ${match[2]}`;
				} else {
					// Fallback if regex doesn't match
					commitMessage = `${ticket}: ${message}`;
				}
			} else {
				commitMessage = `${ticket?.length ? `${ticket}: ` : ''}${message}`;
			}
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
				history,
				cmd.smart
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
				exec('git config --global alias.cs "!gitp commit --smart $*"', (error) => {
					if (error) return reject(error);
					exec('git config --global alias.cas "!gitp commit --add --smart $*"', (error) => {
						if (error) return reject(error);
						resolve();
					});
				});
			});
		});
	}).finally(() => {
		logger('[green]✅ Aliases added to git config.');
		logger(
			'[yellow]You can now use:\n' +
			'[green]git c[yellow] - commit\n' +
			'[green]git ca[yellow] - commit with add\n' +
			'[green]git cs[yellow] - commit with smart context\n' +
			'[green]git cas[yellow] - commit with add and smart context'
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
		.option('--smart', 'Enable smart context analysis for better commit messages', false)
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
		.command('set-conventional-commits-for <path>')
		.description('Add a path to use conventional commits format')
		.action((path) => {
			const current = credentials.useConventionalCommitsIn || [];
			let final = [];

			if (current.find((item) => item.path === path)) {
				logger('[yellow]Path already configured for conventional commits.');
				return;
			} else {
				final = [...current, { path }];
			}

			saveCredentials('gitp', {
				...credentials,
				useConventionalCommitsIn: final
			});
			logger('[green]✅ Path added to conventional commits configuration.');
		});

	program
		.command('remove-conventional-commits-for <path>')
		.description('Remove a path from conventional commits format')
		.action((path) => {
			const current = credentials.useConventionalCommitsIn || [];
			const final = current.filter((item) => item.path !== path);

			if (final.length === current.length) {
				logger('[yellow]Path not found in conventional commits configuration.');
				return;
			}

			saveCredentials('gitp', {
				...credentials,
				useConventionalCommitsIn: final
			});
			logger('[green]✅ Path removed from conventional commits configuration.');
		});

	program
		.command('list-conventional-commits')
		.description('List all paths configured for conventional commits')
		.action(() => {
			const current = credentials.useConventionalCommitsIn || [];

			if (current.length === 0) {
				logger('[yellow]No paths configured for conventional commits.');
				return;
			}

			logger('[green]Paths configured for conventional commits:');
			current.forEach((item) => {
				logger(`[white]  - ${item.path}`);
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
