const core = require('@actions/core');
const github = require('@actions/github');
const { processRelease } = require('./github');
const { updateClickUpTasks } = require('./clickup');

async function run() {
  try {
    // Get inputs
    const githubToken = core.getInput('github-token');
    const clickupApiKey = core.getInput('clickup-api-key');
    const tagPrefix = core.getInput('tag-prefix');
    const includePreviousRelease = core.getInput('include-previous-release') === 'true';

    // Get event payload
    const eventPayload = github.context.payload;
    
    // Check if this is a release event
    if (!eventPayload.release) {
      core.info('This is not a release event. Skipping.');
      return;
    }

    // Get release details
    const releaseName = eventPayload.release.name || eventPayload.release.tag_name;
    const releaseTag = eventPayload.release.tag_name;
    
    core.info(`Processing release: ${releaseName} (${releaseTag})`);
    
    // Process the release to get all relevant commits and extract ClickUp task IDs
    const taskIds = await processRelease(
      eventPayload, 
      githubToken, 
      includePreviousRelease
    );
    
    if (taskIds.length === 0) {
      core.info('No ClickUp task IDs found in the release commits.');
      return;
    }
    
    // Create the tag to add to ClickUp tasks
    const clickUpTag = `${tagPrefix}${releaseName}`;
    
    // Update ClickUp tasks with the release tag
    await updateClickUpTasks(taskIds, clickUpTag, clickupApiKey);
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
