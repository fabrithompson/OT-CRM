import { useRef, useCallback } from 'react';

import connectSrc      from '../assets/audio/connect.mp3';
import disconnectSrc   from '../assets/audio/disconnect.mp3';
import notificationSrc from '../assets/audio/notification.mp3';

const cache = {};

function getAudio(src) {
    if (!cache[src]) {
        const a = new Audio(src);
        a.preload = 'auto';
        cache[src] = a;
    }
    return cache[src];
}

export default function useAudio() {
    const mutedRef = useRef(false);

    const play = useCallback((src) => {
        if (mutedRef.current) return;
        try {
            const audio = getAudio(src);
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } catch {}
    }, []);

    const playConnect      = useCallback(() => play(connectSrc),      [play]);
    const playDisconnect   = useCallback(() => play(disconnectSrc),   [play]);
    const playNotification = useCallback(() => play(notificationSrc), [play]);

    const setMuted = useCallback((val) => { mutedRef.current = val; }, []);
    const isMuted  = () => mutedRef.current;

    return { playConnect, playDisconnect, playNotification, setMuted, isMuted };
}