const fs = require('fs');
const path = require('path');

class FeedbackStore {
  constructor(filePath){
    this.filePath = filePath;
    this._ready = this._init();
    this._writeQueue = Promise.resolve();
  }

  async _init(){
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    try {
      await fs.promises.access(this.filePath, fs.constants.F_OK);
    } catch (err){
      await fs.promises.writeFile(this.filePath, '', { encoding: 'utf8' });
    }
  }

  async save(entry){
    await this._ready;
    const line = `${JSON.stringify(entry)}\n`;
    this._writeQueue = this._writeQueue.then(() => fs.promises.appendFile(this.filePath, line, { encoding: 'utf8' }));
    return this._writeQueue.catch(err => {
      // сбрасываем очередь, чтобы последующие вызовы могли выполниться
      this._writeQueue = Promise.resolve();
      throw err;
    });
  }
}

module.exports = FeedbackStore;
