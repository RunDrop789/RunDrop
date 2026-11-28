(() => {
  function reauthenticateOnce(key) {
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
    if (!window.liff) throw new Error('ไม่สามารถเชื่อมต่อ LINE เพื่อเข้าสู่ระบบใหม่ได้');
    const redirectUri = location.href;
    if (window.liff.isLoggedIn()) window.liff.logout();
    window.liff.login({ redirectUri });
    return true;
  }

  function markFresh(key) {
    sessionStorage.removeItem(key);
  }

  window.RunDropLineSession = Object.freeze({ reauthenticateOnce, markFresh });
})();
