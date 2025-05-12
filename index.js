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
    const inputReleaseName = core.getInput('release-name');

    // Get event payload and context
    const eventPayload = github.context.payload;
    const context = github.context;

    // Determine the release name to use
    let releaseName;

    if (inputReleaseName) {
      // Use the provided release name
      releaseName = inputReleaseName;
    } else if (context.eventName === 'push' && context.ref) {
      // For push events, use the branch name
      releaseName = context.ref.replace('refs/heads/', '');
    } else if (eventPayload.release) {
      // For release events, use the release name or tag
      releaseName = eventPayload.release.name || eventPayload.release.tag_name;
    } else {
      // Default to the current branch or ref
      releaseName = context.ref ? context.ref.replace('refs/heads/', '') : 'unknown';
    }

    core.info(`Processing with name: ${releaseName}`);

    // Process the release to get all relevant commits and extract ClickUp task IDs
    const taskIds = await processRelease(
      eventPayload,
      githubToken,
      includePreviousRelease,
      releaseName
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
