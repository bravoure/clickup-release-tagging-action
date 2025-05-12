const core = require('@actions/core');
const github = require('@actions/github');
const { extractClickUpTaskIds } = require('./clickup');

// Function to get the previous release tag
async function getPreviousReleaseTag(octokit, owner, repo, currentTag) {
  try {
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 100
    });

    // Find the current release index
    const currentIndex = releases.findIndex(release => release.tag_name === currentTag);

    if (currentIndex === -1 || currentIndex === releases.length - 1) {
      // If current tag not found or it's the last release, return null
      return null;
    }

    // Return the next release in the list (which is the previous chronological release)
    return releases[currentIndex + 1].tag_name;
  } catch (error) {
    core.warning(`Error getting previous release: ${error.message}`);
    return null;
  }
}

// Function to get commits between two tags
async function getCommitsBetweenTags(octokit, owner, repo, baseTag, headTag) {
  try {
    const { data: comparison } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: baseTag,
      head: headTag
    });

    return comparison.commits;
  } catch (error) {
    core.error(`Error comparing commits between tags: ${error.message}`);
    return [];
  }
}

// Function to get all commits in a release
async function getCommitsInRelease(octokit, owner, repo, tag) {
  try {
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${tag}`
    });

    const { data: tagData } = await octokit.rest.git.getTag({
      owner,
      repo,
      tag_sha: refData.object.sha
    });

    // If it's an annotated tag, get the commit it points to
    const commitSha = tagData.object.sha;

    // Get the commit
    const { data: commit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha
    });

    return [commit];
  } catch (error) {
    core.error(`Error getting commits for tag ${tag}: ${error.message}`);
    return [];
  }
}

// Function to get commits in a branch
async function getCommitsInBranch(octokit, owner, repo, branchName, maxCommits = 100) {
  try {
    core.info(`Fetching up to ${maxCommits} commits from branch: ${branchName}`);

    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branchName,
      per_page: maxCommits
    });

    core.info(`Successfully fetched ${commits.length} commits from branch: ${branchName}`);

    // Log some sample commit messages for debugging
    if (commits.length > 0) {
      core.info('Sample commit messages:');
      for (let i = 0; i < Math.min(5, commits.length); i++) {
        core.info(`  - ${commits[i].commit.message.split('\n')[0]}`);
      }
    }

    return commits;
  } catch (error) {
    core.error(`Error getting commits for branch ${branchName}: ${error.message}`);
    return [];
  }
}

// Function to get merged pull requests associated with commits
async function getMergedPRsFromCommits(octokit, owner, repo, commits) {
  const mergedPRs = [];
  const prRegex = /Merge pull request #(\d+)/;

  for (const commit of commits) {
    const match = prRegex.exec(commit.commit.message);
    if (match && match[1]) {
      try {
        const prNumber = parseInt(match[1], 10);
        const { data: pr } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber
        });

        if (pr.merged) {
          mergedPRs.push(pr);
        }
      } catch (error) {
        core.warning(`Error fetching PR details: ${error.message}`);
      }
    }
  }

  return mergedPRs;
}

// Main function to process a release and extract ClickUp task IDs
async function processRelease(eventPayload, githubToken, includePreviousRelease, releaseName) {
  const octokit = github.getOctokit(githubToken);
  const owner = eventPayload.repository.owner.login;
  const repo = eventPayload.repository.name;
  const context = github.context;

  let commits = [];
  let taskIds = [];

  // Determine if we're processing a branch or a release
  const isBranch = context.eventName === 'push' && context.ref;

  if (isBranch) {
    // For branch pushes, get commits from the branch
    core.info(`Getting commits for branch: ${releaseName}`);
    commits = await getCommitsInBranch(octokit, owner, repo, releaseName);
  } else if (eventPayload.release) {
    // For releases
    const releaseTag = eventPayload.release.tag_name;

    if (includePreviousRelease) {
      // Get the previous release tag
      const previousTag = await getPreviousReleaseTag(octokit, owner, repo, releaseTag);

      if (previousTag) {
        core.info(`Comparing commits between ${previousTag} and ${releaseTag}`);
        // Get commits between the previous release and current release
        commits = await getCommitsBetweenTags(octokit, owner, repo, previousTag, releaseTag);
      } else {
        core.info(`No previous release found. Getting commits for ${releaseTag}`);
        // If no previous release, just get the commits in this release
        commits = await getCommitsInRelease(octokit, owner, repo, releaseTag);
      }
    } else {
      core.info(`Getting commits for ${releaseTag} only`);
      // Just get the commits in this release
      commits = await getCommitsInRelease(octokit, owner, repo, releaseTag);
    }
  } else {
    // Fallback to getting commits from the current branch/ref
    core.info(`Getting commits for current context: ${releaseName}`);
    commits = await getCommitsInBranch(octokit, owner, repo, releaseName);
  }

  core.info(`Found ${commits.length} commits in the release.`);

  // Extract ClickUp task IDs from commit messages
  core.info('Extracting ClickUp task IDs from commit messages...');
  let commitIdsCount = 0;

  for (const commit of commits) {
    const message = commit.commit.message;
    const idsFromCommit = extractClickUpTaskIds(message);
    if (idsFromCommit.length > 0) {
      core.info(`Found ${idsFromCommit.length} ClickUp IDs in commit: ${message.split('\n')[0]}`);
      taskIds.push(...idsFromCommit);
      commitIdsCount += idsFromCommit.length;
    }
  }

  core.info(`Found ${commitIdsCount} ClickUp task IDs from commit messages.`);

  // Get merged PRs associated with these commits
  core.info('Getting merged PRs associated with these commits...');
  const mergedPRs = await getMergedPRsFromCommits(octokit, owner, repo, commits);
  core.info(`Found ${mergedPRs.length} merged PRs in the release.`);

  // Extract ClickUp task IDs from PR titles and branch names
  core.info('Extracting ClickUp task IDs from PR titles and branch names...');
  let prTitleIdsCount = 0;
  let branchIdsCount = 0;

  for (const pr of mergedPRs) {
    // Extract from PR title
    const idsFromTitle = extractClickUpTaskIds(pr.title);
    if (idsFromTitle.length > 0) {
      core.info(`Found ${idsFromTitle.length} ClickUp IDs in PR title: ${pr.title}`);
      taskIds.push(...idsFromTitle);
      prTitleIdsCount += idsFromTitle.length;
    }

    // Extract from branch name
    const idsFromBranch = extractClickUpTaskIds(pr.head.ref);
    if (idsFromBranch.length > 0) {
      core.info(`Found ${idsFromBranch.length} ClickUp IDs in branch name: ${pr.head.ref}`);
      taskIds.push(...idsFromBranch);
      branchIdsCount += idsFromBranch.length;
    }
  }

  core.info(`Found ${prTitleIdsCount} ClickUp task IDs from PR titles.`);
  core.info(`Found ${branchIdsCount} ClickUp task IDs from branch names.`);
  core.info(`Found ${commitIdsCount + prTitleIdsCount + branchIdsCount} ClickUp task IDs in total before deduplication.`);

  // Remove duplicates
  taskIds = [...new Set(taskIds)];

  core.info(`Found ${taskIds.length} unique ClickUp Task IDs: ${taskIds.join(', ')}`);

  return taskIds;
}

module.exports = {
  processRelease
};
