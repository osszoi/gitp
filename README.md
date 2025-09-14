<div align="center">

<img src="resources/gitp.png" alt="Gitp Logo" width="150">

<p><code>npm install -g gitp</code></p>

</div>

---

# 🚀 Gitp - AI-Powered Git Commits

> Transform your git workflow with intelligent commit messages powered by AI! ✨

Stop wasting time writing commit messages and let AI do the heavy lifting. Gitp analyzes your changes and generates meaningful, contextual commit messages that actually make sense.

## 📸 See It In Action

### git ca - Add files + commit
![git ca](resources/git_ca.png)

### git cai - Interactive file staging
![git cai](resources/git_cai.png)

### git cas - Smart AI analysis (waiting)
![git cas waiting](resources/git_cas_waiting.png)

### git cas - Smart AI analysis (result)
![git cas finished](resources/git_cas_finished.png)

## ✨ Features

- 🤖 **Multi-AI Provider Support** - Works with OpenAI and Google
- 🎯 **Smart Context Analysis** - Understands your code changes for better messages
- 🎫 **Automatic Ticket Integration** - Links commits to Jira/GitHub/GitLab tickets
- 📝 **Conventional Commits** - Perfect for semantic-release workflows
- 🔍 **Dry-run Mode** - Preview before committing
- ⚡ **Git Aliases** - Lightning-fast shortcuts

## 📦 Installation

```sh
npm install -g gitp
```

## 🚀 Quick Start

### 🔧 Initial Setup

**🔑 Set your AI provider and API key:**
```sh
# Choose your AI provider
gitp set-provider openai     # 🤖 OpenAI GPT models
gitp set-provider google     # 🧠 Google Gemini

# Add your API key
gitp set-api-key <your-api-key>

# Pick your model
gitp set-model gpt-5         # For OpenAI
gitp set-model gemini-2.5-pro    # For Google
```

### ⚡ Git Aliases (Recommended!)

Get lightning-fast commits with simple aliases:
```sh
gitp add-alias
```

**🎉 You now have these super shortcuts:**
- `git c` → 💬 Smart commit
- `git ca` → 📁 Add files + smart commit
- `git cs` → 🧠 Smart commit with AI context
- `git cas` → 🚀 Add files + smart commit with AI context

### 🎫 Ticket Integration (Optional)

Link your commits automatically to project tickets:
```sh
gitp set-default-ticket-for /my-project ABC-123
```

### 📋 Conventional Commits (Optional)

Perfect for projects using semantic-release:
```sh
# Enable conventional commits for a project
gitp set-conventional-commits-for /my-awesome-project

# Remove if needed
gitp remove-conventional-commits-for /my-awesome-project

# See all configured projects
gitp list-conventional-commits
```

**✨ Results in commits like:**
- `feat: ABC-123 add user authentication`
- `fix: ABC-123 resolve login timeout issue`
- `chore: update dependencies`

## 💻 Usage

### 🎯 Basic Commands

**💬 Generate and commit:**
```sh
gitp commit
```

**🔍 Preview mode (no actual commit):**
```sh
gitp commit --dry-run
```

**🧠 Smart AI analysis:**
```sh
gitp commit --smart
```

**📁 Auto-add files:**
```sh
gitp commit --add
```

**⚡ Power combo:**
```sh
gitp commit --add --smart --no-verify
```

### 🎛️ All Options

| Flag | Description | Example |
|------|-------------|---------|
| `--add` | 📁 Auto-stage files | `git ca` |
| `--smart` | 🧠 AI context analysis | `git cs` |
| `--dry-run` | 🔍 Preview only | `gitp commit --dry-run` |
| `--no-verify` | ⏭️ Skip git hooks | `gitp commit --no-verify` |
| `-y` | 🚀 Skip confirmation | `gitp commit -y` |

## 🎬 Examples in Action

### 🚀 The Magic Happens

**Before Gitp:**
```
You: *stares at terminal for 5 minutes thinking of commit message*
```

**With Gitp:**
```sh
git ca  # Add files + smart commit
```

![git ca example](resources/git_ca.png)

### 🎯 Interactive File Staging

Use `git cai` to selectively stage files with an interactive interface:

![git cai example](resources/git_cai.png)

### 🧠 Smart Context Analysis

**With Smart AI Analysis:**
```sh
git cas  # Add + Smart AI commit with context analysis
```

**🔄 Processing (AI analyzing your changes):**

![git cas waiting](resources/git_cas_waiting.png)

**✨ Final Result:**

![git cas finished](resources/git_cas_finished.png)

### 🎯 Real-World Scenarios

**🔧 Quick fixes:**
```sh
git c        # Let AI figure out what you fixed
```

**🧪 Feature development:**
```sh
git cas      # Auto-add files + smart context analysis
```

**🔍 Want to see first:**
```sh
gitp commit --dry-run --smart
```

**⚡ Ship it fast:**
```sh
gitp commit --add -y    # No confirmation needed
```

### 🎫 With Ticket Integration

```sh
# Set once per project
gitp set-default-ticket-for /work/api-service TICKET-123

# Every commit gets prefixed automatically
git c
# → "feat: TICKET-123 add user profile endpoints"
```

## 🎯 Why Gitp?

**🤔 Tired of:**
- Spending minutes thinking of commit messages?
- Writing generic "fix stuff" commits?
- Forgetting to mention important changes?
- Inconsistent commit message formats?

**✅ Get instead:**
- 🚀 **Lightning fast** commits with AI
- 📝 **Meaningful messages** that actually describe your changes
- 🎯 **Consistent formatting** across your team
- 🧠 **Smart context** understanding of your code
- 🔄 **Zero learning curve** - works with your existing git workflow

## 🤝 Contributing

Found a bug or want a feature? We'd love your help!

1. 🍴 Fork the repo
2. 🌟 Create your feature branch
3. 💻 Make your changes
4. 🚀 Use `git cas` to commit (dogfooding!)
5. 📤 Push and create a PR

## 📜 License

MIT License - feel free to use in your projects! 🎉

---

**Made with ❤️ for developers who value their time**

*Stop writing boring commit messages. Start using Gitp!* 🚀
