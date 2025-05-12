const axios = require('axios');
const core = require('@actions/core');

// Function to extract ClickUp task IDs from text
function extractClickUpTaskIds(text) {
  if (!text) return [];
  
  // Common patterns for ClickUp task IDs
  // Example: feature/CU-abc123-task-description or fix/cu_abc123_fix-bug
  const patterns = [
    /[cC][uU][-_]([a-zA-Z0-9]+)/g, // Matches CU-abc123 or cu_abc123
    /#([a-zA-Z0-9]+)/g // Matches #abc123
  ];
  
  let taskIds = [];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        taskIds.push(match[1]);
      }
    }
  }
  
  return taskIds;
}

// Function to add a tag to a ClickUp task
async function addTagToTask(taskId, tagName, apiKey) {
  try {
    const response = await axios.post(
      `https://api.clickup.com/api/v2/task/${taskId}/tag/${tagName}`,
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
    const response = await axios.post(
      `https://api.clickup.com/api/v2/task/${taskId}/comment`,
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

// Main function to update ClickUp tasks with release tag
async function updateClickUpTasks(taskIds, releaseTag, clickupApiKey) {
  if (taskIds.length === 0) {
    core.info('No ClickUp task IDs to update.');
    return;
  }
  
  core.info(`Adding tag "${releaseTag}" to ${taskIds.length} ClickUp tasks.`);
  
  let successCount = 0;
  
  for (const taskId of taskIds) {
    // Add release tag
    const success = await addTagToTask(taskId, releaseTag, clickupApiKey);
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
  
  core.info(`Successfully tagged ${successCount} out of ${taskIds.length} ClickUp tasks with "${releaseTag}".`);
}

module.exports = {
  extractClickUpTaskIds,
  updateClickUpTasks
};
