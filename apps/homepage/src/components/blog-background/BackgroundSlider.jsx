"use client";

import { useEffect, useState } from "react";

import { blogSiteConfig } from "./blogSiteConfig";

export default function BackgroundSlider() {
  const [index, setIndex] = useState(0);
  const images = blogSiteConfig.bgImages;

  useEffect(() => {
    if (images.length <= 1) return undefined;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 10000);

    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div className="absolute inset-0 z-[-10] overflow-hidden">
      {images.map((img, i) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out transform-gpu"
          style={{
            backgroundImage: `url(${img})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: i === index ? 1 : 0,
            visibility: Math.abs(i - index) <= 1 || (i === images.length - 1 && index === 0) ? "visible" : "hidden",
          }}
        />
      ))}
    </div>
  );
}
