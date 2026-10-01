"use strict";

(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const initHomeLoader = () => {
    const root = document.documentElement;
    const loader = document.querySelector("[data-home-loader]");
    if (!root.classList.contains("has-home-loader") || !loader) return;
    let closing = false;
    let done = false;
    let minimumTimer;
    let deadlineTimer;
    let exitTimer;
    const complete = () => {
      if (done) return;
      done = true;
      clearTimeout(exitTimer);
      root.classList.remove("has-home-loader");
      loader.classList.remove("is-exiting");
      document.body.classList.remove("is-page-entering");
      document.dispatchEvent(new Event("elevate:page-transition-complete"));
    };
    const close = (immediate = false) => {
      if (closing) return;
      closing = true;
      clearTimeout(minimumTimer);
      clearTimeout(deadlineTimer);
      if (immediate) { complete(); return; }
      loader.classList.add("is-exiting");
      exitTimer = window.setTimeout(complete, 720);
    };
    const ready = () => {
      if (closing) return;
      minimumTimer = window.setTimeout(() => close(), Math.max(0, 2600 - performance.now()));
    };
    reducedMotion.addEventListener("change", (event) => { if (event.matches) close(true); });
    window.addEventListener("pageshow", (event) => { if (event.persisted) close(true); });
    deadlineTimer = window.setTimeout(() => close(), 4500);
    if (document.readyState === "complete") ready();
    else window.addEventListener("load", ready, { once: true });
  };

  const initSecurityNotice = () => {
    const notice = document.querySelector("#security-notice");
    const close = notice?.querySelector("[data-notice-close]");
    close?.addEventListener("click", () => {
      notice.classList.add("is-closing");
      window.setTimeout(() => notice.remove(), 300);
    });
  };

  const initHeroWordmark = () => {
    const wordmark = document.querySelector(".hero-wordmark");
    if (!wordmark) return;
    let started = false;
    const animations = new Set();
    const settle = () => {
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      wordmark.classList.add("is-ready");
    };
    const play = () => {
      if (started || document.body.matches(".is-page-entering")) return;
      started = true;
      wordmark.classList.add("is-ready");
      if (reducedMotion.matches || !Element.prototype.animate) return;
      wordmark.querySelectorAll("span").forEach((letter, index) => {
        const animation = letter.animate([
          { transform: "translateY(18px)", filter: "blur(10px)", opacity: 0 },
          { transform: "translateY(0)", filter: "blur(0px)", opacity: 0.07 },
        ], {
          duration: 1500,
          delay: 120 + index * 100,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        });
        animations.add(animation);
        animation.addEventListener("finish", () => {
          animations.delete(animation);
          animation.cancel();
        }, { once: true });
      });
    };
    document.addEventListener("elevate:page-transition-complete", play);
    reducedMotion.addEventListener("change", (event) => { if (event.matches) settle(); });
    window.addEventListener("pageshow", (event) => { if (event.persisted) { started = true; settle(); } });
    play();
  };

  const initInterviewSlider = () => {
    const carousel = document.querySelector(".interview-slider");
    if (!carousel) return;
    carousel.querySelectorAll(".voice-card img").forEach((image) => {
      const showFallback = () => {
        image.closest(".voice-card__media").classList.add("voice-card__media--fallback");
        image.src = "images/common/logo.png";
      };
      image.addEventListener("error", showFallback, { once: true });
      if (image.complete && !image.naturalWidth) showFallback();
    });
    if (!window.Swiper) return;
    document.querySelectorAll("#voices [data-carousel-prev], #voices [data-carousel-next]")
      .forEach((button) => { button.hidden = false; });

    const slider = new window.Swiper(carousel, {
      slidesPerView: 1.08,
      spaceBetween: 14,
      speed: reducedMotion.matches ? 0 : 500,
      watchOverflow: true,
      navigation: {
        prevEl: "[data-carousel-prev]",
        nextEl: "[data-carousel-next]",
      },
      pagination: {
        el: carousel.querySelector(".swiper-pagination"),
        clickable: true,
      },
      keyboard: { enabled: true, onlyInViewport: true },
      a11y: {
        prevSlideMessage: "前のお客様の声",
        nextSlideMessage: "次のお客様の声",
        paginationBulletMessage: "{{index}}枚目のお客様の声を表示",
        slideLabelMessage: "{{index}} / {{slidesLength}}",
      },
      breakpoints: {
        768: { slidesPerView: 2, spaceBetween: 17 },
        1024: { slidesPerView: 3, spaceBetween: 17 },
      },
    });

    reducedMotion.addEventListener("change", () => {
      slider.params.speed = reducedMotion.matches ? 0 : 500;
    });
    carousel.addEventListener("focusin", (event) => {
      const slide = event.target.closest(".swiper-slide");
      if (slide) slider.slideTo([...slider.slides].indexOf(slide));
    });
  };

  const initBackToTop = () => {
    const button = document.querySelector("[data-back-to-top]");
    const hero = document.querySelector(".hero");
    if (!button || !hero) return;

    const header = document.querySelector(".top-header");
    let framePending = false;
    const sync = () => {
      const headerHeight = header?.getBoundingClientRect().height || 0;
      button.hidden = hero.getBoundingClientRect().bottom > headerHeight;
      framePending = false;
    };
    const scheduleSync = () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(sync);
    };

    sync();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("pageshow", scheduleSync);
    if ("ResizeObserver" in window) new ResizeObserver(scheduleSync).observe(hero);
    button.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
    });
  };

  initHomeLoader();
  initSecurityNotice();
  initHeroWordmark();
  initInterviewSlider();
  initBackToTop();
})();
