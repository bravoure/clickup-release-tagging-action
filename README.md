# ClickUp Release Tagging Action

This GitHub Action automatically adds tags to ClickUp tasks with the release name when a GitHub release is created or published.

## How it works

1. When a GitHub release is created or published, this action is triggered.
2. The action extracts ClickUp task IDs from:
   - Commit messages in the release
   - Branch names of merged PRs
   - PR titles of merged PRs
3. For each found task, it adds a tag with the release name (e.g., "Release: v1.2.3") via the ClickUp API.
4. It also adds a comment to each task indicating it was included in the release.

## Usage

Add the following workflow to your repository in `.github/workflows/clickup-release-tagging.yml`:

```yaml
name: ClickUp Release Tagging

on:
  release:
    types: [published]  # Or 'created' if you want to trigger on release creation

jobs:
  tag-clickup-tasks:
    runs-on: ubuntu-latest
    steps:
      - uses: bravoure/clickup-release-tagging-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          clickup-api-key: ${{ secrets.CLICKUP_API_KEY }}
          tag-prefix: "Release: "  # Optional, defaults to "Release: "
          include-previous-release: "true"  # Optional, defaults to "true"
```

## Requirements

1. **ClickUp API Key**: You need to add your ClickUp API key as a GitHub repository secret named `CLICKUP_API_KEY`. To create this secret:
   - Go to your GitHub repository
   - Navigate to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `CLICKUP_API_KEY`
   - Value: Your ClickUp API key

## Configuration Options

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | Yes | `${{ github.token }}` |
| `clickup-api-key` | ClickUp API Key | Yes | N/A |
| `tag-prefix` | Prefix to add before the release name in the ClickUp tag | No | `Release: ` |
| `include-previous-release` | Whether to include commits from the previous release to this one (`true`) or just this release (`false`) | No | `true` |

## Task ID Format

The action looks for ClickUp task IDs in the following formats:
- `CU-abc123` or `cu-abc123` (case insensitive)
- `CU_abc123` or `cu_abc123` (case insensitive)
- `#abc123`

Make sure your branch names, PR titles, or commit messages contain the task ID in one of these formats.
