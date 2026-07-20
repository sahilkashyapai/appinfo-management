const Settings = require('../models/Settings');

// Fetches the singleton Settings document, creating it with defaults on first use.
async function getSettings() {
  let settings = await Settings.findOne({ singletonKey: 'global' });
  if (!settings) {
    settings = await Settings.create({ singletonKey: 'global' });
  }
  return settings;
}

module.exports = getSettings;
