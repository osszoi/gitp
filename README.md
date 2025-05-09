# Gitp

This project helps automate the process of generating Git commit messages using OpenAI's API, while also providing several useful command-line options to customize the workflow.

## Features

- **OpenAI Integration**: Generate commit messages and descriptions using the OpenAI API.
- **Dry-run Mode**: Simulate the OpenAI request without performing git operations (commit, push, or add).
- **Default Ticket prefix for commits**: Set prefix commits with Jira/Github/Gitlab ticket

## Installation

```sh
npm install -g gitp
```

## Quickstart

### Configure your settings

##### Set API Key
```sh
gitp set-api-key <your api key>
```

##### Set Provider
```sh
gitp set-provider <provider>
```
Available providers: google, openai, deepseek

##### Set Model
```sh
gitp set-model <model>
```

### Set up Git aliases
To create convenient git aliases for gitp commands:
```sh
gitp add-alias
```
This will add:
- `git c` as an alias for `gitp commit`
- `git ca` as an alias for `gitp commit --add`

### Set a default ticket prefix

```sh
gitp set-default-ticket-for <path> <ticket>
```

## Usage

### Generate and commit changes

To generate a commit message and description using the configured provider and commit the changes:

```sh
gitp commit
```

### Dry-run mode

To simulate the request without performing git operations:

```sh
gitp commit --dry-run
```

### Skip git commit hooks

To skip git commit hooks during the commit:

```sh
gitp commit --no-verify
```

## Examples

### Example 1: Basic commit

```sh
gitp commit
```

Output:
```
Message: Added new feature to handle user authentication
Description: Implemented user login and registration functionality. Updated the database schema to include user credentials. Added unit tests for the new feature.
```

### Example 2: Dry-run mode

```sh
gitp commit --dry-run
```

Output:
```
Message: Added new feature to handle user authentication
Description: Implemented user login and registration functionality. Updated the database schema to include user credentials. Added unit tests for the new feature.
Dry-run enabled. Skipping commit and push.
```

### Example 3: Set API key

```sh
gitp set-api-key sk-your-api-key
```

### Example 4: Set default ticket prefix per path

```sh
gitp set-default-ticket-for project1 PROJECT1-0000
```

You can set as many as you want.

### Example 5: Set provider and model

```sh
gitp set-provider openai
gitp set-model gpt-4
```

```sh
gitp set-provider deepseek
gitp set-model deepseek-coder
```

## License

This project is licensed under the MIT License.
