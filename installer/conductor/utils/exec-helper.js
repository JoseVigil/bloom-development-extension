const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

module.exports = {
  execPromise
};