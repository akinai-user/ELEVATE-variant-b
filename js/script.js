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
      wordmark.querySelectorAll("img").forEach((logo) => {
        const animation = logo.animate([
          { clipPath: "inset(0 100% 0 0)", transform: "translateY(18px)", filter: "blur(10px)", opacity: 0 },
          { clipPath: "inset(0 0 0 0)", transform: "translateY(0)", filter: "blur(0px)", opacity: 0.07 },
        ], {
          duration: 1500,
          delay: 120,
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

    const updateSpeed = () => {
      slider.params.speed = reducedMotion.matches ? 0 : 500;
    };
    reducedMotion.addEventListener("change", updateSpeed);
    slider.on("destroy", () => reducedMotion.removeEventListener("change", updateSpeed));
    carousel.addEventListener("focusin", (event) => {
      const slide = event.target.closest(".swiper-slide");
      if (slide) slider.slideTo([...slider.slides].indexOf(slide));
    });
  };

  const refreshNoteVoices = async () => {
    const container = document.querySelector("[data-note-voices]");
    if (!container || !/^https?:$/.test(window.location.protocol)) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(container.dataset.noteEndpoint, {
        signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" },
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
      const data = await response.json();
      const articleURL = /^https:\/\/note\.com\/[A-Za-z0-9_-]+\/n\/[A-Za-z0-9_-]+\/?$/;
      if (!Array.isArray(data.cards) || data.cards.length > 25 || !data.cards.every((card) =>
        card && articleURL.test(card.url) && typeof card.title === "string" && card.title.trim()
        && typeof card.image === "string" && typeof card.date === "string"
        && (!card.date || /^\d{4}-\d{2}-\d{2}$/.test(card.date)))) return;
      if (!/^https:\/\/note\.com\/[A-Za-z0-9_-]+(?:\/m\/[A-Za-z0-9_-]+)?$/.test(data.destination)) return;
      // Avoid replacing a card while a visitor is reading or using its link.
      if (container.contains(document.activeElement)) return;
      const element = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const fragment = document.createDocumentFragment();
      if (data.cards.length) {
        const wrap = element("div", "carousel-wrap");
        const arrow = (direction, label, text) => {
          const button = element("button", `carousel-arrow carousel-arrow--${direction}`, text);
          button.type = "button";
          button.hidden = true;
          button.setAttribute("aria-label", label);
          button.setAttribute(`data-carousel-${direction}`, "");
          return button;
        };
        const carousel = element("div", "swiper interview-slider");
        carousel.id = "interview-list";
        carousel.setAttribute("aria-label", "お客様の声");
        const slides = element("div", "swiper-wrapper");
        data.cards.forEach((card) => {
          const slide = element("div", "swiper-slide");
          const link = element("a", "interview-card voice-card hover-image hover-lift");
          link.href = card.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.setAttribute("aria-label", `${card.title}（note・別タブで開く）`);
          const media = element("div", "voice-card__media");
          const image = element("img");
          let imageURL;
          try { imageURL = new URL(card.image); } catch { /* Use the logo below. */ }
          const validImage = imageURL?.protocol === "https:" && !imageURL.username && !imageURL.password;
          image.src = validImage ? imageURL.href : "images/common/logo.png";
          if (!validImage) media.classList.add("voice-card__media--fallback");
          image.alt = "";
          image.width = 1200;
          image.height = 675;
          image.loading = "lazy";
          image.decoding = "async";
          media.append(image);
          const meta = element("p", "voice-card__meta");
          if (card.date) {
            const time = element("time", "", card.date.replaceAll("-", "."));
            time.dateTime = card.date;
            meta.append(time);
          }
          meta.append(element("span", "", "noteで読む ↗"));
          link.append(media, element("h3", "", card.title), meta);
          slide.append(link);
          slides.append(slide);
        });
        carousel.append(slides, element("div", "swiper-pagination"));
        wrap.append(arrow("prev", "前のお客様の声", "←"), carousel, arrow("next", "次のお客様の声", "→"));
        fragment.append(wrap);
      } else {
        const empty = element("div", "voices-empty");
        empty.append(element("p", "voices-empty__label", "COMING SOON"),
          element("h3", "", "お客様の声は、ただいま準備中です。"),
          element("p", "", "サービスをご利用いただいたお客様のストーリーを、順次ご紹介します。"));
        fragment.append(empty);
      }
      const more = container.querySelector(".voices-more")?.cloneNode(true);
      if (more) {
        more.querySelector("a").href = data.destination;
        fragment.append(more);
      }
      container.querySelector(".interview-slider")?.swiper?.destroy(true, true);
      container.replaceChildren(fragment);
      initInterviewSlider();
    } catch {
      // Static preview, unavailable PHP, or network failure: retain existing cards.
    } finally {
      window.clearTimeout(timeout);
    }
  };

  initHomeLoader();
  initSecurityNotice();
  initHeroWordmark();
  initInterviewSlider();
  refreshNoteVoices();
})();
