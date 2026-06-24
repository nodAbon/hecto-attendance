'use client';

import React, { useEffect, useState } from 'react';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export default function PushManager({ empNo }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPermission(Notification.permission);
      
      navigator.serviceWorker.register('/sw.js').then(registration => {
        registration.pushManager.getSubscription().then(subscription => {
          setIsSubscribed(subscription !== null);
          if (subscription && empNo) {
            // Send subscription to server in case it changed
            sendSubscriptionToServer(subscription, empNo);
          }
        });
      });
    }
  }, [empNo]);

  const sendSubscriptionToServer = async (subscription, empNo) => {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, empNo })
      });
    } catch (err) {
      console.error('Failed to send push subscription to server', err);
    }
  };

  const subscribeUser = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      
      const response = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await response.json();
      
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      await sendSubscriptionToServer(subscription, empNo);
      setIsSubscribed(true);
      alert('푸시 알림이 활성화되었습니다!');
    } catch (err) {
      console.error('Failed to subscribe the user: ', err);
      alert('푸시 알림 활성화 중 오류가 발생했습니다.');
    }
  };

  if (permission === 'granted' && isSubscribed) {
    return null; // Don't show anything if already subscribed
  }

  const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      background: 'var(--bg-card, #ffffff)',
      border: '1px solid var(--border, #e5e7eb)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      padding: '12px 16px',
      borderRadius: 12,
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      {!isSupported && (
        <div style={{ fontSize: 13, color: 'var(--red, #ef4444)' }}>
          현재 환경에서는 푸시 알림이 지원되지 않습니다.<br/>
          (안전한 HTTPS 환경 또는 모던 브라우저 필요)
        </div>
      )}

      {isSupported && permission === 'denied' && (
        <div style={{ fontSize: 13, color: 'var(--red, #ef4444)' }}>
          푸시 알림이 차단되어 있습니다.<br/>
          주소창 왼쪽 자물쇠 아이콘을 눌러 알림을 허용해주세요.
        </div>
      )}

      {isSupported && permission !== 'denied' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-1)' }}>
            결재 결과 등 푸시 알림을 받으시겠습니까?
          </div>
          <button 
            onClick={subscribeUser}
            style={{
              background: 'var(--green, #22c55e)',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            알림 켜기
          </button>
        </div>
      )}
    </div>
  );
}
