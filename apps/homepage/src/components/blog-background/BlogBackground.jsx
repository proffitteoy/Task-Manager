"use client";

import BackgroundEffects from "./BackgroundEffects";
import BackgroundSlider from "./BackgroundSlider";
import ClickEffect from "./ClickEffect";
import GlobalSnow from "./GlobalSnow";
import { ThemeProvider } from "./ThemeProvider";
import WeatherEffect from "./WeatherEffect";
import { blogSiteConfig } from "./blogSiteConfig";

export default function BlogBackground() {
  return (
    <ThemeProvider>
      <div className="workstation-blog-background" aria-hidden="true">
        {!blogSiteConfig.useGradient && <BackgroundSlider />}
        <div className="absolute inset-0 z-[-9] bg-white/30 dark:bg-slate-900/40 backdrop-blur-md transition-colors duration-1000" />
        <div
          className="absolute inset-0 z-[-8] opacity-60 dark:opacity-20 mix-blend-color transition-opacity duration-1000 transform-gpu"
          style={{
            background: `linear-gradient(-45deg, ${blogSiteConfig.themeColors.join(", ")})`,
            backgroundSize: "400% 400%",
            animation: "gradientMove 15s ease infinite",
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay" />
        <WeatherEffect />
        <div className="hidden md:block absolute inset-0 w-full h-full">
          <BackgroundEffects />
        </div>
      </div>
      <div className="hidden md:block" aria-hidden="true">
        <ClickEffect />
      </div>
      <GlobalSnow />
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
              @keyframes gradientMove {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
              }
            `,
        }}
      />
    </ThemeProvider>
  );
}
