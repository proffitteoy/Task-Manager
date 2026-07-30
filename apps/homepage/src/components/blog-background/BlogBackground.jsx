"use client";

import { blogSiteConfig } from "./blogSiteConfig";

export default function BlogBackground() {
  const backgroundImage = blogSiteConfig.useGradient
    ? `linear-gradient(135deg, ${blogSiteConfig.themeColors.join(", ")})`
    : `url(${blogSiteConfig.bgImages[0]})`;

  return (
    <div className="workstation-blog-background" aria-hidden="true">
      <div
        className="absolute inset-0 z-[-10]"
        style={{
          backgroundImage,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
      <div
        className="absolute inset-0 z-[-9]"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.42), rgba(226,232,240,0.2) 52%, rgba(224,231,255,0.28))",
        }}
      />
    </div>
  );
}
