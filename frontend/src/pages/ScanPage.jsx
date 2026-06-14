/**
 * @fileoverview Utility Bill Scanner — Gemini Vision API integration.
 *
 * Allows users to photograph or upload a utility bill (electricity, gas, water).
 * The image is sent to the backend /api/scan endpoint which uses Gemini's vision
 * capabilities to extract energy consumption (kWh) and calculate CO₂ emissions.
 *
 * Features:
 * - Drag-and-drop + file picker + camera capture
 * - Base64 encoding with MIME type detection
 * - Live image preview with remove button
 * - Animated scan result with extracted data breakdown
 * - Accessible file input with ARIA labels
 */

import React, { useState, useCallback, useRef, useId, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@context/AuthContext.jsx';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB   = 10;
const MAX_SIZE_B    = MAX_SIZE_MB * 1024 * 1024;

// ── File → Base64 helper ─────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]); // strip data: prefix
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ── Scan result display ──────────────────────────────────────────────────────
function ScanResultCard({ data }) {
  const { kWhExtracted, billMonth, provider, kgCO2e, rawText } = data;

  const items = [
    { label: 'Energy Consumed',    value: kWhExtracted != null ? `${kWhExtracted} kWh` : 'Not detected', icon: '⚡' },
    { label: 'CO₂ Emitted',        value: kgCO2e != null       ? `${kgCO2e} kg`        : 'N/A',          icon: '🌫️' },
    { label: 'Bill Month',         value: billMonth  || 'Not detected', icon: '📅' },
    { label: 'Provider / Utility', value: provider   || 'Not detected', icon: '🏢' },
  ];

  return (
    <div
      className="card"
      role="region"
      aria-label="Scan result"
      style={{
        background: 'linear-gradient(135deg, hsla(166,76%,20%,0.3), hsla(217,91%,20%,0.15))',
        border: '1px solid var(--glass-border)',
        animation: 'fadeInUp 0.4s ease-out',
      }}
    >
      <h2
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          marginBottom: 'var(--space-5)',
        }}
      >
        📊 Extracted Data
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {items.map(({ label, value, icon }) => (
          <div
            key={label}
            className="card"
            style={{
              padding: 'var(--space-4)',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
            }}
          >
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {icon} {label}
            </p>
            <p
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-semibold)',
                color: value.includes('Not') ? 'var(--text-muted)' : 'var(--text-primary)',
              }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* CO₂ significance banner */}
      {kgCO2e != null && (
        <div
          style={{
            background: kgCO2e < 50 ? 'hsla(142,71%,20%,0.4)' : 'hsla(38,92%,20%,0.4)',
            border: `1px solid ${kgCO2e < 50 ? 'hsla(142,71%,40%,0.4)' : 'hsla(38,92%,40%,0.4)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-5)',
            fontSize: 'var(--text-sm)',
            color: kgCO2e < 50 ? 'var(--color-success-400)' : 'var(--color-warning-400)',
          }}
          role="status"
          aria-live="polite"
        >
          {kgCO2e < 50
            ? `✅ Great! Your ${kgCO2e} kg CO₂e is below average for this bill type.`
            : `⚠️ Your ${kgCO2e} kg CO₂e is above average. Check the AI Insights for tips.`}
        </div>
      )}

      {/* Raw extracted text (collapsible) */}
      {rawText && (
        <details style={{ marginTop: 'var(--space-2)' }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              userSelect: 'none',
              padding: 'var(--space-2) 0',
            }}
          >
            📄 View raw extracted text
          </summary>
          <pre
            style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-4)',
              background: 'var(--bg-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {rawText}
          </pre>
        </details>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
        <Link
          to="/insights"
          className="btn btn--primary"
          style={{ flex: 1, textAlign: 'center' }}
          aria-label="Get AI insights based on this bill scan"
        >
          🌿 Get AI Insights
        </Link>
        <Link
          to="/"
          className="btn btn--secondary"
          style={{ flex: 1, textAlign: 'center' }}
        >
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}

// ── Main ScanPage ────────────────────────────────────────────────────────────
/**
 * Utility Bill Scanner page.
 * Uses Gemini Vision via backend to extract energy data from bills.
 *
 * @returns {React.ReactElement}
 */
export default function ScanPage() {
  const { user }   = useAuth();
  const uid        = useId();
  const fileInputRef = useRef(null);
  const dropZoneRef  = useRef(null);

  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null); // data URL for img preview
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  // Build preview URL when file changes
  useEffect(() => {
    if (!file || file.type === 'application/pdf') {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validateAndSet = useCallback((selectedFile) => {
    setError('');
    setResult(null);

    if (!selectedFile) return;
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError('Unsupported file type. Please upload a JPEG, PNG, WebP, or PDF.');
      return;
    }
    if (selectedFile.size > MAX_SIZE_B) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }
    setFile(selectedFile);
  }, []);

  // File picker change
  const handleFileChange = useCallback(
    (e) => validateAndSet(e.target.files?.[0]),
    [validateAndSet]
  );

  // Drag handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      validateAndSet(e.dataTransfer.files?.[0]);
    },
    [validateAndSet]
  );

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleScan = useCallback(async () => {
    if (!file) {
      setError('Please select a file to scan.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const imageBase64 = await fileToBase64(file);
      const API         = import.meta.env.VITE_API_BASE_URL || '';
      const token       = await user.getIdToken();

      const resp = await fetch(`${API}/api/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageBase64,
          mimeType: file.type,
          userId:   user.uid,
        }),
      });

      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.message || 'Scan failed. Please try again.');
      }
      setResult(json.data);
    } catch (err) {
      setError(err.message || 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [file, user]);

  const inputId = `${uid}-file`;

  return (
    <section aria-labelledby="scan-heading">
      {/* ── Page header ── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1
          id="scan-heading"
          className="gradient-text"
          style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)' }}
        >
          📄 Utility Bill Scanner
        </h1>
        <p className="text-muted" style={{ marginTop: 'var(--space-2)' }}>
          Upload your electricity, gas, or water bill. Gemini AI will extract energy
          data and calculate your carbon emissions automatically.
        </p>
      </div>

      {/* ── Drop zone ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Hidden file input */}
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-label="Upload utility bill image or PDF"
        />

        {!file ? (
          /* Drop zone area */
          <div
            ref={dropZoneRef}
            role="button"
            tabIndex={0}
            aria-label="Drop zone: drag and drop a utility bill file here, or click to browse"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            style={{
              border: `2px dashed ${dragging ? 'var(--color-brand-400)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-12)',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? 'hsla(166,76%,20%,0.15)' : 'var(--bg-tertiary)',
              transition: 'all 0.2s ease',
              outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.outline = '2px solid var(--color-brand-400)')}
            onBlur={(e)  => (e.currentTarget.style.outline = 'none')}
          >
            <div
              style={{
                fontSize: '3rem',
                marginBottom: 'var(--space-4)',
                transition: 'transform 0.2s ease',
                transform: dragging ? 'scale(1.2)' : 'scale(1)',
              }}
              aria-hidden="true"
            >
              📂
            </div>
            <p
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-semibold)',
                marginBottom: 'var(--space-2)',
              }}
            >
              {dragging ? 'Drop your bill here!' : 'Drag & drop or click to upload'}
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Supports JPEG, PNG, WebP, PDF • Max {MAX_SIZE_MB} MB
            </p>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ marginTop: 'var(--space-5)' }}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              📁 Browse Files
            </button>
          </div>
        ) : (
          /* File preview area */
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-5)',
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Utility bill preview"
                  style={{
                    width: '120px',
                    height: '120px',
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '3rem',
                    flexShrink: 0,
                    border: '1px solid var(--border-subtle)',
                  }}
                  aria-label="PDF document"
                >
                  📄
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontWeight: 'var(--font-semibold)',
                    fontSize: 'var(--text-base)',
                    marginBottom: 'var(--space-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}
                </p>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ marginTop: 'var(--space-3)', color: 'var(--color-danger-400)' }}
                  onClick={handleRemoveFile}
                  aria-label="Remove selected file"
                >
                  🗑️ Remove
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                style={{
                  background: 'hsla(0,84%,20%,0.3)',
                  border: '1px solid hsla(0,84%,55%,0.4)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  color: 'var(--color-danger-400)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* Scan button */}
            <button
              type="button"
              className="btn btn--primary"
              style={{ width: '100%' }}
              onClick={handleScan}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '16px',
                      height: '16px',
                      border: '2px solid currentColor',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      marginRight: 'var(--space-2)',
                      verticalAlign: 'middle',
                    }}
                    aria-hidden="true"
                  />
                  Gemini is reading your bill...
                </>
              ) : (
                '🔍 Scan with Gemini AI'
              )}
            </button>
          </div>
        )}

        {/* Error when no file */}
        {!file && error && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              background: 'hsla(0,84%,20%,0.3)',
              border: '1px solid hsla(0,84%,55%,0.4)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              marginTop: 'var(--space-4)',
              color: 'var(--color-danger-400)',
              fontSize: 'var(--text-sm)',
            }}
          >
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* ── Scan result ── */}
      {result && <ScanResultCard data={result} />}

      {/* ── How it works ── */}
      {!result && (
        <div
          className="card"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          <h2
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--font-semibold)',
              marginBottom: 'var(--space-4)',
              color: 'var(--text-secondary)',
            }}
          >
            ✨ How It Works
          </h2>
          <ol
            style={{
              paddingLeft: 'var(--space-5)',
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            {[
              { step: 'Upload your utility bill (photo or PDF)',             icon: '📤' },
              { step: 'Gemini Vision AI reads and extracts energy usage',    icon: '🤖' },
              { step: 'We calculate your CO₂ emissions using IPCC factors', icon: '🧮' },
              { step: 'Get personalized tips to reduce your footprint',      icon: '🌿' },
            ].map(({ step, icon }) => (
              <li key={step} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                <span aria-hidden="true" style={{ marginRight: 'var(--space-2)' }}>{icon}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Link to="/" className="btn btn--ghost">
          ← Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
