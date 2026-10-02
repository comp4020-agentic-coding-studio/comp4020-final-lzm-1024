import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('keeps built-in interface text, game prompts and documentation in English', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/english-copy.test.mjs'], { timeout: 10000 });
  expect(result.stdout).toContain('# fail 0');
}, 15000);

it('verifies custom design, live friend collaboration, private snapshots and persistence', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/designer.integration.mjs'], { timeout: 30000 });
  expect(result.stdout).toContain('# fail 0');
}, 35000);

it('keeps motion feedback balanced across failures, concurrent requests and reduced-motion dialogs', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/motion.test.mjs'], { timeout: 10000 });
  expect(result.stdout).toContain('# fail 0');
}, 15000);

it('verifies bounded query reuse, single-query lists, compression and cache permission boundaries', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/performance.test.mjs', 'scripts/frontend-performance.test.mjs'], { timeout: 20000 });
  expect(result.stdout).toContain('# fail 0');
}, 25000);

it('verifies 24 photo test posters per campus, migration preservation, assets and calendar labelling', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/photo-gallery.test.mjs'], { timeout: 15000 });
  expect(result.stdout).toContain('# fail 0');
}, 20000);

it('verifies the complete rules and hidden information of ten games', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/games-rules.test.mjs'], { timeout: 15000 });
  expect(result.stdout).toContain('# fail 0');
}, 20000);

it('verifies authenticated two-player game rooms, live privacy, simultaneous actions and persistence', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/games.integration.mjs'], { timeout: 50000 });
  expect(result.stdout).toContain('# fail 0');
}, 55000);

it('verifies CampusWall product scenarios with two real WebSocket clients and a restart', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/campuswall.integration.mjs'], { timeout: 50000 });
  expect(result.stdout).toContain('# fail 0');
}, 55000);

it('verifies private inbox identity, isolation, unread messages and restart persistence', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/messaging.integration.mjs'], { timeout: 50000 });
  expect(result.stdout).toContain('# fail 0');
}, 55000);

it('verifies fixed account universities and per-campus public chat', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/campus-access.integration.mjs'], { timeout: 45000 });
  expect(result.stdout).toContain('# fail 0');
}, 50000);

it('verifies university email domain locking and existing account compatibility', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/email-campus.integration.mjs'], { timeout: 35000 });
  expect(result.stdout).toContain('# fail 0');
}, 40000);

it('verifies object-based whiteboard sync, cursors, undo guards, image privacy and restart persistence', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/whiteboard.integration.mjs'], { timeout: 40000 });
  expect(result.stdout).toContain('# fail 0');
}, 45000);
it('verifies avatar upload, live chat photos, emoji insertion and restart persistence', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/avatar.integration.mjs'], { timeout: 30000 });
  expect(result.stdout).toContain('# fail 0');
}, 35000);
it('verifies personal introductions, public notes, author/owner permissions and persistence', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/profile.integration.mjs'], { timeout: 30000 });
  expect(result.stdout).toContain('# fail 0');
}, 35000);
it('verifies watch room synchronisation, host permissions, live chat/danmaku, online presence and persistence', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/watch.integration.mjs'], { timeout: 30000 });
  expect(result.stdout).toContain('# fail 0');
}, 35000);

it('keeps embedded host playback running through sync ticks and buffering without granting viewers controls', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/watch-player.test.mjs'], { timeout: 30000 });
  expect(result.stdout).toContain('# fail 0');
}, 35000);


it('verifies bookings, notifications, friends/groups, clubs, teams, calendar/map, screenings and game results', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/community.integration.mjs'], { timeout: 50000 });
  expect(result.stdout).toContain('# fail 0');
}, 55000);


it('verifies private voice signalling and ordered audio negotiation, mute and cleanup', async () => {
  const result = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'scripts/voice-calls.integration.mjs', 'scripts/voice-transport.test.mjs', 'scripts/voice-ui.test.mjs'], { timeout: 45000 });
  expect(result.stdout).toContain('# fail 0');
  const audio = await promisify(execFile)(process.execPath, ['scripts/voice-audio.e2e.mjs'], { timeout: 20000 });
  expect(audio.stdout).toContain('Both real WebRTC peers received decoded synthetic audio');
}, 50000);
