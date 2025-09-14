#!/usr/bin/env node

const { Command } = require('commander');
const OpenAI = require('openai');
const simpleGit = require('simple-git');
const logger = require('./log');
const inquirer = require('inquirer').default;
const { query } = require('llm-querier');
const { gatherSmartContext, extractChangedFiles, filterLockFilesFromDiff } = require('./contextGatherer');
const ora = require('ora');

// Load API key from environment variables or a config file
const { loadCredentials, saveCredentials } = require('@edjl/config');

const credentials = loadCredentials('gitp');

// Cool waiting messages for LLM responses
const WAITING_MESSAGES = [
	"🤖 AI is crafting the perfect commit message...",
	"🧠 Neural networks are analyzing your genius code...",
	"✨ Magic is happening in the cloud...",
	"🚀 Loading AI superpowers...",
	"🎯 Targeting the most descriptive words...",
	"🔮 Consulting the commit message oracle...",
	"⚡ Charging up the creativity circuits...",
	"🎨 Painting your changes with words...",
	"🧙‍♂️ Casting commit message spells...",
	"🔥 Igniting the AI engines...",
	"💎 Polishing your commit to perfection...",
	"🌟 Stardust is settling into words...",
	"🎪 The AI circus is performing for you...",
	"🦄 Unicorns are writing your commit...",
	"🎵 Composing a symphony of code changes...",
	"🍕 AI is ordering pizza... wait, analyzing code...",
	"🎲 Rolling the dice of perfect descriptions...",
	"🏆 Competing for the best commit award...",
	"🌈 Painting rainbows with your diffs...",
	"🎭 Performing commit message theater...",
	"🔬 Running scientific commit experiments...",
	"🎪 Ladies and gentlemen, the amazing AI...",
	"🌙 Nighttime coding deserves stellar commits...",
	"☕ AI needs coffee too... processing...",
	"🎨 Bob Ross would be proud of this commit...",
	"🎯 Bullseye! Aiming for commit perfection...",
	"🚁 Helicopter view of your code changes...",
	"🎪 Step right up to the commit carnival...",
	"🔍 CSI: Code Scene Investigation...",
	"🎵 Your code changes are music to my circuits..."
];

function getRandomWaitingMessage() {
	return WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)];
}

const git = simpleGit();


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

async function generateCommit(diff, branchName, history = [], smartMode = false) {
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

	// Filter out lock files from diff before sending to LLM
	const filteredDiff = filterLockFilesFromDiff(diff);

	// Prepare context array
	const contextArray = [filteredDiff];

	// Add branch name to context
	if (branchName) {
		contextArray.push(`Current branch: ${branchName}`);
	}

	// Add smart context if enabled
	if (smartMode) {
		const changedFiles = extractChangedFiles(diff);
		const smartContext = await gatherSmartContext(diff, changedFiles);

		if (smartContext) {
			contextArray.push(smartContext);
		}
	}

	// Check if conventional commits should be used
	const useConventionalCommits = shouldUseConventionalCommits();

	// Start the LLM spinner with a random message
	const llmSpinner = ora(getRandomWaitingMessage()).start();

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
			}. If a branch name is provided, extract any ticket information from it to include in the commit message.

			# Ticket Extraction from Branch Name
			Look for ticket patterns in the branch name and extract them. Common patterns include:
			- feature/TICKET-123 → TICKET-123
			- feat/AB12-1234 → AB12-1234
			- OP-1234 → OP-1234
			- fix--TT-1234--finally → TT-1234
			- hotfix/ASDF-1234--for-now-urgent → ASDF-1234

			# CRITICAL Requirements
			${
				useConventionalCommits
					? `- MUST use conventional commit format following the npm library @semantic-release standard
			- You must decide which conventional commit type best applies to the changes
			- For ticket formatting in conventional commits:
			  * If ticket exists: feat(TICKET-123): description here
			  * If no ticket but descriptive branch: feat(feature name): description here
			  * If ticket and scope: feat(scope, TICKET-123): description here
			- Examples of conventional commits with tickets:
			  * feature/ASDF-1234 → feat(ASDF-1234): add user authentication
			  * feature/some-new-feature → feat(new feature): implement dashboard
			  * bugfix/TICKET-456 → fix(TICKET-456): resolve memory leak
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
			- For ticket formatting in non-conventional commits:
			  * If ticket exists: TICKET-123: description here
			  * If no ticket: description here
			- Examples of non-conventional commits with tickets:
			  * feature/ASDF-1234 → ASDF-1234: Add user authentication
			  * feature/whatever → Add user authentication
			  * bugfix/TICKET-456 → TICKET-456: Fix memory leak
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
				COMMIT_MESSAGE: feat(PERF-123): implement async request batching for API calls
				COMMIT_DESCRIPTION: Reduces server load by combining multiple API requests into batched operations. This architectural change improves performance by 40% during peak usage and prevents rate limiting issues encountered in production.
			`,
			`
				COMMIT_MESSAGE: fix(MEM-456): resolve memory leak in event listener cleanup
				COMMIT_DESCRIPTION: Event listeners were not being properly removed on component unmount, causing memory consumption to grow over time. Implemented proper cleanup in lifecycle methods to ensure all listeners are detached when components are destroyed.
			`
		] : [
			`
				COMMIT_MESSAGE: PERF-123: Implement async request batching for API calls
				COMMIT_DESCRIPTION: Reduces server load by combining multiple API requests into batched operations. This architectural change improves performance by 40% during peak usage and prevents rate limiting issues encountered in production.
			`,
			`
				COMMIT_MESSAGE: MEM-456: Fix memory leak in event listener cleanup
				COMMIT_DESCRIPTION: Event listeners were not being properly removed on component unmount, causing memory consumption to grow over time. Implemented proper cleanup in lifecycle methods to ensure all listeners are detached when components are destroyed.
			`
		]
	});

	llmSpinner.succeed('🎉 Perfect commit message generated!');

	const commit = result.split('\n').map((line) => line.trim());

	let commitMessage = '';
	let commitDescription = '';
	commit.forEach((line) => {
		if (line.startsWith('COMMIT_MESSAGE:')) {
			commitMessage = line.replace('COMMIT_MESSAGE:', '').trim();
		} else if (line.startsWith('COMMIT_DESCRIPTION:')) {
			commitDescription = line.replace('COMMIT_DESCRIPTION:', '').trim();
		}
	});

	return { commitMessage, commitDescription };
}

async function commitCommand(cmd) {
	let addExecuted = false;
	let commitCompleted = false;

	// Cleanup function to revert git add if needed
	const cleanup = async () => {
		if (addExecuted && !commitCompleted) {
			try {
				logger('[yellow]⚠️ Reverting git add due to cancellation...');
				await git.reset(['HEAD']);
				logger('[green]✅ Git add reverted successfully.');
			} catch (error) {
				logger('[red]❌ Failed to revert git add:', error.message);
			}
		}
	};

	// Set up signal handlers
	const signalHandler = async (signal) => {
		logger(`\n[yellow]⚠️ Received ${signal}, cleaning up...`);
		await cleanup();
		process.exit(0);
	};

	process.on('SIGINT', signalHandler);
	process.on('SIGTERM', signalHandler);

	try {
		const isGitRepo = await git.checkIsRepo();
		if (!isGitRepo) {
			logger('[red]❌ This is not a Git repository.');
			return;
		}

		if (cmd.add) {
			await git.add('.');
			addExecuted = true;
		}

		const diff = await git.diff(['--cached']); // ['--cached']
		const branch = await git
			.revparse(['--abbrev-ref', 'HEAD'])
			.catch(() => null);
		if (!branch) {
			logger('[red]❌ Unable to get current branch name.');
			return;
		}

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
				branch,
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

			let answers;
			try {
				answers = await inquirer.prompt([
					{
						type: 'input',
						name: 'feedback',
						message: 'Accept? (Press Enter to accept, or provide feedback for improvement):',
						default: ''
					}
				]);
			} catch (error) {
				// User cancelled with Ctrl+C
				if (error.isTtyError === false || error.name === 'ExitPromptError') {
					logger('\n[yellow]⚠️ Operation cancelled by user.');
					await cleanup();
					return;
				}
				throw error;
			}

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
		commitCompleted = true;
	} catch (error) {
		logger('❌ Error:', error.message);
		await cleanup();
	} finally {
		// Clean up signal handlers
		process.removeListener('SIGINT', signalHandler);
		process.removeListener('SIGTERM', signalHandler);
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
