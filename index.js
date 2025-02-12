#!/usr/bin/env node

const { Command } = require('commander');
const OpenAI = require('openai');
const simpleGit = require('simple-git');
const logger = require('./log');

// Load API key from environment variables or a config file
const { loadCredentials, saveCredentials } = require('@edjl/config');

const credentials = loadCredentials('gitp');

const providers = {
	deepseek: {
		config: {
			baseURL: 'https://api.deepseek.com',
			apiKey: credentials.deepseekApiKey || ''
		},
		model: 'deepseek-chat'
	},
	gpt: {
		config: {
			apiKey: credentials.openAiApiKey || ''
		},
		model: 'gpt-4o'
	}
};

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

async function generateCommit(diff, ticket) {
	const provider = providers[credentials.provider];

	if (!provider) {
		logger('[red]❌ No provider selected.');
		return {};
	}

	const openai = new OpenAI(provider.config);

	const ticketPart = ticket.length
		? `prefixed with the Jira/GitHub/GitLab ticket (${ticket})`
		: '';

	const prompt = `Yo, here's what changed in the repo:\n\n${diff}\n\nI need a single commit message for this. Keep it short and to the point—no fluff. If multiple files changed but it's all related, roll it into one commit. If something really needs extra detail, fine, but keep it minimal. The message should be something a senior dev would write, no over-explaining. ${
		ticketPart ? `Prefix it with the ticket (${ticket}) if applicable.` : ''
	}
		Format it like this:
		COMMIT_MESSAGE: <commit message here>
		COMMIT_DESCRIPTION: <commit description here>

		ONLY return what I asked, nothing else.`;

	const completion = await openai.chat.completions.create({
		model: provider.model,
		messages: [{ role: 'user', content: prompt }]
	});

	const commit = completion.choices[0].message.content
		.trim()
		.split('\n')
		.map((line) => line.trim());

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

		const { commitMessage, commitDescription } = await generateCommit(
			diff,
			ticket
		);

		if (!commitMessage) {
			return;
		}

		logger(`[green]Message: [white] ${commitMessage}`);
		logger(`[green]Description: [white]${commitDescription}`);

		if (cmd.dryRun) {
			logger('[yellow]Dry-run enabled. Skipping commit and push.');
			return;
		}

		let commitArgs = `${commitMessage}\n\n${commitDescription}`;

		if (cmd.verify) {
			commitArgs += ' --no-verify';
		}

		await git.commit(commitArgs);
	} catch (error) {
		console.error('Error:', error.message);
	}
}

async function addAliasToGitConfig() {
	const { exec } = require('child_process');

	return new Promise((resolve, reject) => {
		exec('git config --global alias.c "!gitp commit"', (error) => {
			if (error) return reject(error);
			exec('git config --global alias.ca "!gitp commit --add"', (error) => {
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
		.action(commitCommand);

	program
		.command('set-openai-key <key>')
		.description('Set the OpenAI API key')
		.action((key) => {
			saveCredentials('gitp', { ...credentials, openAiApiKey: key });
		});

	program
		.command('set-deepseek-key <key>')
		.description('Set the DeepSeek API key')
		.action((key) => {
			saveCredentials('gitp', { ...credentials, deepseekApiKey: key });
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
		.command('add-alias')
		.description('Add aliases to the git config')
		.action(addAliasToGitConfig);

	program.parse(process.argv);
}

main();
