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
async function processRelease(eventPayload, githubToken, includePreviousRelease) {
  const octokit = github.getOctokit(githubToken);
  const owner = eventPayload.repository.owner.login;
  const repo = eventPayload.repository.name;
  const releaseTag = eventPayload.release.tag_name;
  
  let commits = [];
  let taskIds = [];
  
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
  
  core.info(`Found ${commits.length} commits in the release.`);
  
  // Extract ClickUp task IDs from commit messages
  for (const commit of commits) {
    const message = commit.commit.message;
    const idsFromCommit = extractClickUpTaskIds(message);
    if (idsFromCommit.length > 0) {
      taskIds.push(...idsFromCommit);
    }
  }
  
  // Get merged PRs associated with these commits
  const mergedPRs = await getMergedPRsFromCommits(octokit, owner, repo, commits);
  core.info(`Found ${mergedPRs.length} merged PRs in the release.`);
  
  // Extract ClickUp task IDs from PR titles and branch names
  for (const pr of mergedPRs) {
    // Extract from PR title
    const idsFromTitle = extractClickUpTaskIds(pr.title);
    if (idsFromTitle.length > 0) {
      taskIds.push(...idsFromTitle);
    }
    
    // Extract from branch name
    const idsFromBranch = extractClickUpTaskIds(pr.head.ref);
    if (idsFromBranch.length > 0) {
      taskIds.push(...idsFromBranch);
    }
  }
  
  // Remove duplicates
  taskIds = [...new Set(taskIds)];
  
  core.info(`Found ${taskIds.length} unique ClickUp Task IDs: ${taskIds.join(', ')}`);
  
  return taskIds;
}

module.exports = {
  processRelease
};
