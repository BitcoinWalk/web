"use client";

import Image from "next/image";
import {useEffect, useRef, useState} from "react";
import styles from "./city-directory.module.css";

export default function HeroPhotos() {
  const container = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (container.current) observer.observe(container.current);
    const update = () => setTabVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => {observer.disconnect(); document.removeEventListener("visibilitychange", update);};
  }, []);
  return <>
    <div ref={container} className={styles.heroVisual} data-paused={paused || !visible || !tabVisible}>
      {[1, 2, 3].map((number, index) => <Image key={number} className={styles.heroSlide}
        src={`/brand/walk-${number}.jpg`} alt={index === 0 ? "BitcoinWalk friends gathering their feet in a circle" : ""}
        fill sizes="(max-width: 1100px) 100vw, 70vw" preload={index === 0} loading={index === 0 ? undefined : "eager"}
        style={{animationDelay: `${index === 0 ? 0 : -(3 - index) * 12}s`}}/>) }
    </div>
    <button className={styles.heroPlayback} type="button" onClick={() => setPaused(value => !value)}
      aria-label={paused ? "Resume photo rotation" : "Pause photo rotation"}>{paused ? "▶" : "Ⅱ"}</button>
  </>;
}
