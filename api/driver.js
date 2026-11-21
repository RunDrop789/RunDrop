import meHandler from '../lib/driver/me.js';
import statusHandler from '../lib/driver/status.js';
import registerHandler from '../lib/driver/register.js';
import uploadHandler from '../lib/driver/upload.js';
import onlineHandler from '../lib/driver/online.js';
import locationHandler from '../lib/driver/location.js';
import availableHandler from '../lib/driver/available.js';
import acceptHandler from '../lib/driver/accept.js';
import jobsHandler from '../lib/driver/jobs.js';
import statusUpdateHandler from '../lib/driver/status-update.js';
import messagesHandler from '../lib/driver/messages.js';

const ACTIONS = {
  me: meHandler,
  status: statusHandler,
  register: registerHandler,
  upload: uploadHandler,
  online: onlineHandler,
  location: locationHandler,
  available: availableHandler,
  accept: acceptHandler,
  jobs: jobsHandler,
  'status-update': statusUpdateHandler,
  messages: messagesHandler
};

export default async function handler(req, res) {
  const action = String(req.query?.action || '');
  const fn = ACTIONS[action];
  if (!fn) return res.status(404).json({ error: 'unknown action' });
  return fn(req, res);
}