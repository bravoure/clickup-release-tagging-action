const axios = require('axios');
const core = require('@actions/core');

// Function to extract ClickUp task IDs from text
function extractClickUpTaskIds(text) {
  if (!text) return [];

  // Common patterns for ClickUp task IDs
  // Example: feature/CU-abc123-task-description or fix/cu_abc123_fix-bug
  const patterns = [
    /([cC][uU][-_][a-zA-Z0-9]+)/g, // Matches CU-abc123 or cu_abc123 (full ID)
    /#([a-zA-Z0-9]+)/g // Matches #abc123 (only ID part)
  ];

  let taskIds = [];

  // First pattern: extract full IDs (CU-abc123)
  let match;
  while ((match = patterns[0].exec(text)) !== null) {
    if (match[1]) {
      // Normalize to uppercase CU-
      const taskId = match[1].replace(/^cu[-_]/i, 'CU-');
      taskIds.push(taskId);
      core.info(`Found ClickUp task ID: ${taskId} in text: ${text}`);
    }
  }

  // Second pattern: extract IDs without prefix (#abc123) and add CU- prefix
  while ((match = patterns[1].exec(text)) !== null) {
    if (match[1]) {
      const taskId = `CU-${match[1]}`;
      taskIds.push(taskId);
      core.info(`Found ClickUp task ID from #: ${taskId} in text: ${text}`);
    }
  }

  return taskIds;
}

// Function to add a tag to a ClickUp task
async function addTagToTask(taskId, tagName, apiKey) {
  try {
    // Extract the ID part from the full ClickUp ID (e.g., "CU-abc123" -> "abc123")
    const idPart = taskId.replace(/^CU[-_]/i, '');

    core.info(`Adding tag "${tagName}" to ClickUp task ${taskId} (ID part: ${idPart})`);

    const response = await axios.post(
      `https://api.clickup.com/api/v2/task/${idPart}/tag/${tagName}`,
      {},
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    core.info(`Successfully added "${tagName}" tag to ClickUp task ${taskId}.`);
    return true;
  } catch (error) {
    // If the tag already exists on the task, this is fine
    if (error.response && error.response.status === 400 &&
        error.response.data && error.response.data.err === "Tag already exists on task") {
      core.info(`Tag "${tagName}" already exists on ClickUp task ${taskId}.`);
      return true;
    }

    core.error(`Error adding tag to task ${taskId}:`);
    if (error.response) {
      core.error(`Status: ${error.response.status}`);
      core.error(`Response: ${JSON.stringify(error.response.data)}`);
    } else {
      core.error(error.message);
    }
    return false;
  }
}

// Function to add a comment to a ClickUp task
async function addCommentToTask(taskId, comment, apiKey) {
  try {
    // Extract the ID part from the full ClickUp ID (e.g., "CU-abc123" -> "abc123")
    const idPart = taskId.replace(/^CU[-_]/i, '');

    core.info(`Adding comment to ClickUp task ${taskId} (ID part: ${idPart})`);

    const response = await axios.post(
      `https://api.clickup.com/api/v2/task/${idPart}/comment`,
      { comment_text: comment },
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    core.info(`Successfully added comment to ClickUp task ${taskId}.`);
    return true;
  } catch (error) {
    core.error(`Error adding comment to task ${taskId}:`);
    if (error.response) {
      core.error(`Status: ${error.response.status}`);
      core.error(`Response: ${JSON.stringify(error.response.data)}`);
    } else {
      core.error(error.message);
    }
    return false;
  }
}

// Function to sanitize tag name for ClickUp API
function sanitizeTagName(tagName) {
  // Replace slashes with dashes
  let sanitized = tagName.replace(/\//g, '-');

  // Replace any other characters that might cause issues
  sanitized = sanitized.replace(/:/g, '-');

  // Trim to reasonable length if needed (ClickUp might have limits)
  if (sanitized.length > 50) {
    sanitized = sanitized.substring(0, 50);
  }

  return sanitized;
}

// Main function to update ClickUp tasks with release tag
async function updateClickUpTasks(taskIds, releaseTag, clickupApiKey) {
  if (taskIds.length === 0) {
    core.info('No ClickUp task IDs to update.');
    return;
  }

  // Sanitize the tag name for ClickUp API
  const sanitizedTag = sanitizeTagName(releaseTag);

  core.info(`Adding tag "${sanitizedTag}" to ${taskIds.length} ClickUp tasks.`);
  core.info(`Original tag was "${releaseTag}"`);

  let successCount = 0;

  for (const taskId of taskIds) {
    core.info(`Processing ClickUp task ID: ${taskId}`);

    // Add release tag
    const success = await addTagToTask(taskId, sanitizedTag, clickupApiKey);
    if (success) {
      successCount++;

      // Add a comment about the release
      await addCommentToTask(
        taskId,
        `This task has been included in release: ${releaseTag}`,
        clickupApiKey
      );
    }
  }

  core.info(`Successfully tagged ${successCount} out of ${taskIds.length} ClickUp tasks with "${sanitizedTag}".`);
}

module.exports = {
  extractClickUpTaskIds,
  updateClickUpTasks,
  sanitizeTagName
};
