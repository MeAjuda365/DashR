'use strict';

/**
 * HR Requests route — receives employee requests from the HR portal.
 * Mounts at: POST /api/hr-requests
 *
 * Auth: X-Portal-Token header (shared token for employees, no API key needed).
 * Falls back to X-Api-Key for internal/manager calls.
 *
 * On receipt:
 *   1. Validates and sanitises the payload
 *   2. Writes to data/hr-requests.json (append) as a durable local log
 *   3. Forwards to OpenClaw gateway → Connie → HRBot → Helen A6
 *   4. Returns { ok: true, data: { request_id } }
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const router = express.Router();

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'hr-requests.json');
const PORTAL_TOKEN = process.env.HR_PORTAL_TOKEN || 'hr-portal-dev';
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY || '';

// Allowed request types
const VALID_TYPES = ['vacation', 'sick_leave', 'absence', 'document', 'other'];

// ── Auth middleware (portal token OR API key) ───────────────────────────────
function portalAuth(req, res, next) {
  const portalToken = req.headers['x-portal-token'];
  const apiKey = req.headers['x-api-key'];

  if (portalToken === PORTAL_TOKEN) return next();
  if (apiKey && apiKey === process.env.DASHBOARD_API_KEY) return next();

  return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function loadRequests() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveRequests(requests) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2), 'utf8');
}

function buildRequestId() {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `HR-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

// ── POST /api/hr-requests ────────────────────────────────────────────────────
router.post('/', portalAuth, async (req, res) => {
  const {
    employee_name,
    employee_email,
    request_type,
    start_date,
    end_date,
    days_requested,
    doc_type,
    reason,
    channel,
    submitted_at,
  } = req.body;

  // Validate required fields
  if (!employee_name || typeof employee_name !== 'string' || !employee_name.trim()) {
    return res.status(400).json({ ok: false, error: 'employee_name is required', code: 'VALIDATION_ERROR' });
  }
  if (!employee_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee_email)) {
    return res.status(400).json({ ok: false, error: 'Valid employee_email is required', code: 'VALIDATION_ERROR' });
  }
  if (!request_type || !VALID_TYPES.includes(request_type)) {
    return res.status(400).json({
      ok: false,
      error: `request_type must be one of: ${VALID_TYPES.join(', ')}`,
      code: 'VALIDATION_ERROR',
    });
  }

  const needsDates = ['vacation', 'sick_leave', 'absence'].includes(request_type);
  if (needsDates && (!start_date || !end_date)) {
    return res.status(400).json({ ok: false, error: 'start_date and end_date required for this request type', code: 'VALIDATION_ERROR' });
  }

  // Build request record
  const request = {
    request_id: buildRequestId(),
    employee_name: employee_name.trim().slice(0, 200),
    employee_email: employee_email.trim().toLowerCase(),
    request_type,
    start_date: start_date || null,
    end_date: end_date || null,
    days_requested: Number.isFinite(days_requested) ? days_requested : null,
    doc_type: doc_type || null,
    reason: reason ? reason.trim().slice(0, 1000) : null,
    channel: channel || 'portal',
    status: 'received',
    submitted_at: submitted_at || new Date().toISOString(),
    received_at: new Date().toISOString(),
    forwarded_to_helen: false,
    helen_task_id: null,
  };

  // Persist locally first (durable before forwarding)
  const requests = loadRequests();
  requests.push(request);
  saveRequests(requests);

  // Forward to OpenClaw gateway → Connie → HRBot → Helen A6
  let forwardedOk = false;
  try {
    forwardedOk = await forwardToHelen(request);
    if (forwardedOk) {
      request.forwarded_to_helen = true;
      saveRequests(requests);
    }
  } catch (err) {
    console.error('[hr-requests] Gateway forward failed:', err.message);
    // Not fatal — request is persisted, Helen will pick it up on next poll
  }

  console.log(`[hr-requests] New request ${request.request_id} — ${request.request_type} from ${request.employee_email}`);

  return res.status(201).json({
    ok: true,
    data: {
      request_id: request.request_id,
      status: 'received',
      forwarded: forwardedOk,
      message: 'Pedido recebido. Receberá resposta por email em até 2 dias úteis.',
    },
  });
});

// ── GET /api/hr-requests ─────────────────────────────────────────────────────
// Manager view — requires API key, not portal token
router.get('/', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.DASHBOARD_API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }

  const requests = loadRequests();
  const { status, type, employee } = req.query;

  let filtered = requests;
  if (status) filtered = filtered.filter(r => r.status === status);
  if (type) filtered = filtered.filter(r => r.request_type === type);
  if (employee) {
    const q = employee.toLowerCase();
    filtered = filtered.filter(r =>
      r.employee_name.toLowerCase().includes(q) ||
      r.employee_email.toLowerCase().includes(q)
    );
  }

  // Most recent first
  filtered.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

  return res.json({ ok: true, data: filtered, meta: { total: filtered.length } });
});

// ── PATCH /api/hr-requests/:id ────────────────────────────────────────────────
// Update status (approve/reject) — managers only
router.patch('/:id', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.DASHBOARD_API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }

  const { status, resolution_notes } = req.body;
  const validStatuses = ['received', 'in_review', 'approved', 'rejected'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      ok: false,
      error: `status must be one of: ${validStatuses.join(', ')}`,
      code: 'VALIDATION_ERROR',
    });
  }

  const requests = loadRequests();
  const idx = requests.findIndex(r => r.request_id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'Request not found', code: 'NOT_FOUND' });
  }

  requests[idx].status = status;
  requests[idx].resolution_notes = resolution_notes || null;
  requests[idx].resolved_at = new Date().toISOString();
  saveRequests(requests);

  return res.json({ ok: true, data: requests[idx] });
});

// ── Forward to OpenClaw via REST gateway ─────────────────────────────────────
async function forwardToHelen(request) {
  if (!OPENCLAW_API_KEY) return false;

  const typeLabel = {
    vacation: 'férias',
    sick_leave: 'baixa médica',
    absence: 'ausência',
    document: 'documento',
    other: 'pedido',
  }[request.request_type] || request.request_type;

  const dates = request.start_date
    ? ` de ${request.start_date} a ${request.end_date} (${request.days_requested ?? '?'} dias úteis)`
    : '';

  const message = [
    `Novo pedido de RH via portal:`,
    `Colaborador: ${request.employee_name} <${request.employee_email}>`,
    `Tipo: ${typeLabel}${dates}`,
    request.doc_type ? `Documento: ${request.doc_type}` : '',
    request.reason ? `Observações: ${request.reason}` : '',
    `Ref: ${request.request_id}`,
  ].filter(Boolean).join('\n');

  const body = JSON.stringify({
    agent: 'connie',
    message: `HRBot, ${message}. Context: pedido submetido via HR Portal. Source: portal.`,
    source: 'portal',
  });

  const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
  if (!fetch) return false;

  const resp = await fetch(`${OPENCLAW_GATEWAY_URL}/api/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_API_KEY}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });

  return resp.ok;
}

module.exports = router;
