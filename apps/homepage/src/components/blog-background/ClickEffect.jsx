"use client";

import { useEffect, useRef } from "react";

export default function ClickEffect() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    class Ripple {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.r = 0;
        this.maxR = 60;
        this.opacity = 0.6;
        this.velocity = 2.5;
      }

      update() {
        this.r += this.velocity;
        this.velocity *= 0.96;
        this.opacity -= 0.015;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(129, 140, 248, ${this.opacity})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129, 140, 248, ${this.opacity * 0.3})`;
        ctx.fill();
      }
    }

    const ripples = [];

    const handleClick = (event) => {
      ripples.push(new Ripple(event.clientX, event.clientY));
    };

    window.addEventListener("click", handleClick);

    let animationFrame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(129, 140, 248, 0.5)";

      for (let i = 0; i < ripples.length; i += 1) {
        ripples[i].update();
        ripples[i].draw();
        if (ripples[i].opacity <= 0) {
          ripples.splice(i, 1);
          i -= 1;
        }
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("click", handleClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[9999]" />;
}
