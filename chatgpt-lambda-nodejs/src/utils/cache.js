const NodeCache = require('node-cache');
const logger = require('./logger');

class CacheService {
  constructor(ttlSeconds = 60) {
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2,
      useClones: false
    });
    logger.info(`Cache initialized with TTL: ${ttlSeconds} seconds`);
  }
  
  get(key) {
    const value = this.cache.get(key);
    if (value) {
      logger.debug(`Cache hit for key: ${key}`);
      return value;
    }
    logger.debug(`Cache miss for key: ${key}`);
    return null;
  }
  
  set(key, value, ttl = undefined) {
    this.cache.set(key, value, ttl);
    logger.debug(`Cache set for key: ${key}`);
    return value;
  }
  
  delete(key) {
    logger.debug(`Cache delete for key: ${key}`);
    return this.cache.del(key);
  }
  
  flush() {
    logger.info('Cache flushed');
    return this.cache.flushAll();
  }
  
  stats() {
    return this.cache.getStats();
  }
}

module.exports = new CacheService(); 