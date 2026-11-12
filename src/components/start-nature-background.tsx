import Image from "next/image";
import hero from "./city-directory.module.css";
import styles from "./start-nature-background.module.css";

// Keep the original hills, woodland and coast photos alongside the new scenes.
// Each photo is composed for the side where its walkers appear.
const scenes = ["hills", "madeira-laurel", "woodland", "urban-canal", "coast", "madeira-mountain", "urban-park"];

export default function StartNatureBackground({screen}: {screen: number}) {
  const activeScene = screen % scenes.length;
  const activeSide = activeScene % 2 === 0 ? "right" : "left";
  return <div className={styles.root} aria-hidden="true" data-start-nature data-side={activeSide}>
    {scenes.map((scene, index) => <div key={scene} className={`${hero.heroVisual} ${styles.backdrop}`} data-side={index % 2 === 0 ? "right" : "left"}>
      <Image src={`/brand/start-${scene}.webp`} alt="" fill
        sizes="(max-width: 1100px) 100vw, 70vw" preload={index === 0}
        className={styles.photo} data-active={activeScene === index} />
    </div>)}
  </div>;
}
