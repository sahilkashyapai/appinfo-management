let registered = false;

export function registerServiceWorker() {
  if (registered || !('serviceWorker' in navigator)) return;
  registered = true;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed:', err));
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function subscribeToPush(api) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission denied');

  const reg = await navigator.serviceWorker.ready;
  const { data } = await api.get('/push/public-key');
  if (!data.publicKey) throw new Error('Push notifications are not configured on the server yet.');

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });
  await api.post('/push/subscribe', subscription.toJSON());
}

export async function unsubscribeFromPush(api) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    await api.post('/push/unsubscribe', { endpoint: subscription.endpoint });
  }
}
