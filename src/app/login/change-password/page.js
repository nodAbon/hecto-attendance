'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '비밀번호 변경에 실패했습니다.');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/'), 1800);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cp-page">
      <div className="cp-card">
        <div className="cp-header">
          <div className="cp-badge">HECTO</div>
          <h1 className="cp-title">비밀번호 변경</h1>
          <p className="cp-subtitle">
            초기 계정 로그인 후에는 새 비밀번호를 설정해야 합니다.
            <br />
            로그인 화면과 같은 밝은 테마로 맞춰두었습니다.
          </p>
        </div>

        {success ? (
          <div className="cp-success" role="status">
            <div className="cp-success-icon">✓</div>
            <p>
              비밀번호가 변경되었습니다.
              <br />
              잠시 후 메인 화면으로 이동합니다.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="cp-form">
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">
                새 비밀번호
              </label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                placeholder="새 비밀번호를 입력하세요"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">
                비밀번호 확인
              </label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                placeholder="비밀번호를 다시 입력하세요"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {newPassword && (
              <div className="pw-strength" aria-live="polite">
                <div className={`pw-bar ${newPassword.length >= 8 ? 'ok' : 'weak'}`} />
                <span className={newPassword.length >= 8 ? 'ok' : 'weak'}>
                  {newPassword.length < 8 ? '너무 짧음' : newPassword.length < 12 ? '보통' : '강함'}
                </span>
              </div>
            )}

            {error && (
              <div className="cp-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="cp-btn" disabled={loading}>
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </div>

      <style>{`
        .cp-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .cp-page::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top right, rgba(249, 115, 22, 0.10), transparent 28%),
            radial-gradient(circle at bottom left, rgba(251, 146, 60, 0.08), transparent 26%);
          pointer-events: none;
        }

        .cp-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          padding: 48px 40px;
          border-radius: 24px;
          border: 1px solid rgba(226, 232, 240, 0.95);
          background: rgba(255, 255, 255, 0.92);
          box-shadow:
            0 18px 40px -18px rgba(15, 23, 42, 0.28),
            0 8px 24px -16px rgba(249, 115, 22, 0.18);
          backdrop-filter: blur(12px);
        }

        .cp-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .cp-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 12px;
          border-radius: 999px;
          background: linear-gradient(135deg, #f97316, #fb923c);
          color: #fff;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          margin-bottom: 16px;
          box-shadow: 0 8px 20px rgba(249, 115, 22, 0.22);
        }

        .cp-title {
          margin: 0 0 10px;
          font-size: 1.65rem;
          line-height: 1.2;
          letter-spacing: -0.03em;
          color: #0f172a;
          font-weight: 800;
        }

        .cp-subtitle {
          margin: 0;
          color: #64748b;
          line-height: 1.7;
          font-size: 0.95rem;
        }

        .cp-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-label {
          font-size: 0.875rem;
          font-weight: 700;
          color: #334155;
        }

        .form-input {
          width: 100%;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #0f172a;
          padding: 12px 14px;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s ease;
        }

        .form-input::placeholder {
          color: #94a3b8;
        }

        .form-input:focus {
          border-color: #f97316;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.12);
        }

        .pw-strength {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pw-bar {
          flex: 1;
          height: 5px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }

        .pw-bar.weak {
          background: linear-gradient(90deg, #fb7185, #f43f5e);
        }

        .pw-bar.ok {
          background: linear-gradient(90deg, #f59e0b, #22c55e);
        }

        .pw-strength span {
          min-width: 44px;
          text-align: right;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .pw-strength span.weak {
          color: #e11d48;
        }

        .pw-strength span.ok {
          color: #15803d;
        }

        .cp-error {
          border-radius: 12px;
          border: 1px solid rgba(239, 68, 68, 0.25);
          background: rgba(254, 242, 242, 0.95);
          color: #b91c1c;
          padding: 12px 14px;
          font-size: 0.88rem;
          line-height: 1.5;
        }

        .cp-btn {
          border: none;
          border-radius: 14px;
          padding: 14px 16px;
          background: linear-gradient(135deg, #f97316, #fb923c);
          color: #fff;
          font-size: 0.97rem;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 12px 28px -12px rgba(249, 115, 22, 0.55);
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .cp-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 16px 32px -14px rgba(249, 115, 22, 0.6);
        }

        .cp-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .cp-success {
          text-align: center;
          padding: 18px 8px 8px;
          color: #475569;
          line-height: 1.75;
          font-size: 0.96rem;
        }

        .cp-success-icon {
          width: 54px;
          height: 54px;
          margin: 0 auto 14px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #f97316, #fb923c);
          color: #fff;
          font-size: 1.5rem;
          font-weight: 900;
          box-shadow: 0 12px 24px -12px rgba(249, 115, 22, 0.55);
        }

        @media (max-width: 640px) {
          .cp-card {
            padding: 36px 22px;
            border-radius: 20px;
          }

          .cp-title {
            font-size: 1.45rem;
          }
        }
      `}</style>
    </div>
  );
}
