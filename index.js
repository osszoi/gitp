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

	const prompt = `Here is a list of changes detected in a Git repository:\n\n${diff}\n\nPlease generate separate and generate ONE commit. Be profesional, the result must compare to a Senior Developer. Be critic, no need to add 1 commit per file unless the context requires it. Be CONCISE and SHORT, no need to over explain anything, we're dealing with profesionals here. The commit must have a short and concise Git commit message ${ticketPart} and a more detailed description of the changes for the commit.\n\nUse the following format for the output:\nCOMMIT_MESSAGE: <commit message here>\nCOMMIT_DESCRIPTION: <commit description here>\n\nPlease ONLY output what I asked, NO MORE text.`;

	const completion = await openai.chat.completions.create({
		model: deepseekConfig.model,
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

		const diff = await git.diff(); // ['--cached']
		const branch = await git
			.revparse(['--abbrev-ref', 'HEAD'])
			.catch(() => null);
		if (!branch) {
			logger('[red]❌ Unable to get current branch name.');
			return;
		}

		const ticket = extractTicketFromBranch(branch);

		if (!diff.length) {
			logger('[red]❗ No changes to commit.');
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

		await git.add('.');

		let commitArgs = `${commitMessage}\n\n${commitDescription}`;
		if (cmd.verify) {
			commitArgs += ' --no-verify';
		}

		await git.commit(commitArgs);
	} catch (error) {
		console.error('Error:', error.message);
	}
}

async function main() {
	const program = new Command();

	program
		.command('commit')
		.option('--dry-run', 'Perform OpenAI request without git operations', false)
		.option('--no-verify', 'Skip git commit hooks', false)
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
			saveCredentials('gitp', {
				...credentials,
				defaultTicketFor: [
					...(credentials.defaultTicketFor || []),
					{ path, ticket }
				]
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

	program.parse(process.argv);
}

main();
