"use strict";

(() => {
  const updateCurrentYear = () => {
    const year = String(new Date().getFullYear());
    document.querySelectorAll("[data-current-year]").forEach((element) => {
      element.textContent = year;
    });
  };

  const initStickyHeader = () => {
    const header = document.querySelector(".top-header");
    if (!header) return;

    const syncHeight = () => {
      document.documentElement.style.setProperty(
        "--sticky-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    };
    const syncShadow = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 72);
    };

    syncHeight();
    syncShadow();
    if ("ResizeObserver" in window) new ResizeObserver(syncHeight).observe(header);
    else window.addEventListener("resize", syncHeight);
    window.addEventListener("scroll", syncShadow, { passive: true });
  };

  const initMenu = () => {
    const button = document.querySelector("[data-menu-button]");
    const navigation = document.querySelector("#global-nav");
    if (!button || !navigation) return;

    const desktopMedia = window.matchMedia("(min-width: 768px)");
    const backgroundElements = document.querySelectorAll(
      "main, .top-footer, [data-back-to-top]",
    );
    const originalInert = new Map();
    const close = (restoreFocus = false) => {
      const wasOpen = navigation.classList.contains("is-open");
      button.classList.remove("is-open");
      navigation.classList.remove("is-open");
      document.body.classList.remove("menu-open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "メニューを開く");
      originalInert.forEach((value, element) => { element.inert = value; });
      originalInert.clear();
      if (wasOpen && restoreFocus) button.focus();
    };
    const open = () => {
      navigation.classList.add("is-open");
      button.classList.add("is-open");
      document.body.classList.add("menu-open");
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-label", "メニューを閉じる");
      backgroundElements.forEach((element) => {
        originalInert.set(element, element.inert);
        element.inert = true;
      });
      navigation.scrollTop = 0;
      navigation.querySelector("a")?.focus({ preventScroll: true });
    };

    button.addEventListener("click", () => {
      if (navigation.classList.contains("is-open")) close(true);
      else open();
    });
    navigation.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => close());
    });
    document.addEventListener("keydown", (event) => {
      if (!navigation.classList.contains("is-open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...document.querySelectorAll(".top-header a, .top-header button")]
        .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    desktopMedia.addEventListener("change", (event) => {
      if (event.matches) close();
    });
  };

  const initServiceMenu = () => {
    const navigation = document.querySelector("#global-nav");
    const header = document.querySelector(".top-header");
    if (!navigation || !header) return;
    const desktopMedia = window.matchMedia("(min-width: 768px)");
    const definitions = [
      { path: "service/index.html", items: [
        { label: "総合人材派遣サービス", path: "staffing/index.html", icon: "people" },
        { label: "IT・DX事業", path: "dx/index.html", icon: "technology" },
      ] },
      { path: "introduction/index.html", items: [
        { label: "総合人材派遣サービス", path: "staffing/index.html", icon: "people" },
        { label: "よくあるご質問", path: "faq/index.html", icon: "question" },
      ] },
      { path: "registered/index.html", items: [
        { label: "前払い申請フォーム", path: "../advance-payment/index.html", icon: "document" },
        { label: "交通費申請フォーム", path: "../transportation-expenses/index.html", icon: "route" },
      ] },
    ];
    const triggers = definitions.map(definition => ({
      ...definition,
      link: navigation.querySelector(`:scope > a[href$="${definition.path}"]`),
    })).filter(definition => definition.link);
    const backdrop = document.createElement("div");
    backdrop.className = "header-menu-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    header.append(backdrop);
    let menus = [];
    let active;
    let closeTimer;

    const close = (restoreFocus = false) => {
      clearTimeout(closeTimer);
      if (!active) return;
      const previous = active;
      active = undefined;
      previous.wrapper.classList.remove("is-open");
      previous.link.setAttribute("aria-expanded", "false");
      header.classList.remove("has-open-menu");
      if (restoreFocus) previous.link.focus({ preventScroll: true });
    };
    const open = (menu) => {
      clearTimeout(closeTimer);
      if (active === menu) return;
      close();
      active = menu;
      menu.wrapper.classList.add("is-open");
      menu.link.setAttribute("aria-expanded", "true");
      header.classList.add("has-open-menu");
    };
    const scheduleClose = () => {
      clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        if (!active?.wrapper.contains(document.activeElement)) close();
      }, 150);
    };
    const build = () => {
      if (menus.length || !desktopMedia.matches) return;
      triggers.forEach(({ link, items }, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "service-navigation";
        link.before(wrapper);
        wrapper.append(link);
        const panel = document.createElement("div");
        panel.className = "service-menu";
        panel.id = `header-menu-${index}`;
        panel.setAttribute("role", "group");
        panel.setAttribute("aria-label", `${link.textContent.trim()}のサブメニュー`);
        const heading = document.createElement("span");
        heading.className = "service-menu__heading";
        heading.textContent = link.textContent.trim();
        const list = document.createElement("div");
        list.className = "service-menu__items";
        items.forEach(({ label, path, icon }, itemIndex) => {
          const item = document.createElement("a");
          item.className = "service-menu__link";
          item.href = new URL(path, link.href).href;
          item.style.setProperty("--menu-order", itemIndex);
          const visual = document.createElement("span");
          visual.className = `service-menu__icon service-menu__icon--${icon}`;
          visual.setAttribute("aria-hidden", "true");
          const text = document.createElement("span");
          text.className = "service-menu__label";
          text.textContent = label;
          const arrow = document.createElement("span");
          arrow.className = "service-menu__arrow";
          arrow.setAttribute("aria-hidden", "true");
          arrow.textContent = "→";
          item.append(visual, text, arrow);
          list.append(item);
        });
        panel.append(heading, list);
        wrapper.append(panel);
        link.setAttribute("aria-controls", panel.id);
        link.setAttribute("aria-expanded", "false");
        const menu = { wrapper, link };
        menus.push(menu);
        wrapper.addEventListener("pointerenter", event => {
          if (event.pointerType === "mouse") open(menu);
        });
        wrapper.addEventListener("pointerleave", scheduleClose);
        panel.addEventListener("pointerenter", () => clearTimeout(closeTimer));
        panel.addEventListener("pointerleave", scheduleClose);
        wrapper.addEventListener("focusin", () => open(menu));
        wrapper.addEventListener("focusout", () => {
          requestAnimationFrame(() => {
            if (!wrapper.contains(document.activeElement) && active === menu) close();
          });
        });
      });
    };
    const destroy = () => {
      close();
      menus.forEach(({ wrapper, link }) => {
        link.removeAttribute("aria-controls");
        link.removeAttribute("aria-expanded");
        wrapper.before(link);
        wrapper.remove();
      });
      menus = [];
    };
    backdrop.addEventListener("pointerenter", scheduleClose);
    backdrop.addEventListener("click", () => close());
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !active) return;
      event.preventDefault();
      const link = active.link;
      link.focus({ preventScroll: true });
      close();
    });
    window.addEventListener("blur", () => close());
    navigation.querySelectorAll(":scope > a").forEach(link => {
      if (triggers.some(trigger => trigger.link === link)) return;
      link.addEventListener("pointerenter", () => close());
      link.addEventListener("focus", () => close());
    });
    build();
    desktopMedia.addEventListener("change", () => desktopMedia.matches ? build() : destroy());
  };

  const initRevealAnimations = () => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches || !("IntersectionObserver" in window) || !Element.prototype.animate) return;

    const animations = new Set();
    const pending = new Set();
    const directions = new WeakMap();
    const compact = window.matchMedia("(max-width: 767px)");
    const observer = new IntersectionObserver((entries) => {
      let order = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (reducedMotion.matches) return;

        const animation = entry.target.animate(
          [
            { opacity: 0, translate: directions.get(entry.target) },
            { opacity: 1, translate: "0 0" },
          ],
          {
            duration: 820,
            delay: Math.min(order++ * 70, 210),
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        );
        animations.add(animation);
        animation.addEventListener("finish", () => {
          entry.target.classList.remove("motion-reveal-pending");
          pending.delete(entry.target);
          animations.delete(animation);
          animation.cancel();
        }, { once: true });
      });
    }, { threshold: 0.01 });

    const candidates = [];
    const groups = "[data-reveal], .service-card, .seeker-card, .overview-card, .renewal-feature, " +
      ".renewal-link-card, .boxlist__item, .boxlist02__item, .steplist__item, " +
      ".company-info-item, .renewal-faq, .privacy__item, .advance-form-card, .renewal-form";
    const prepare = () => {
      const elements = document.querySelectorAll(
        groups.split(", ").map(selector => `main ${selector}`).join(", ") +
        ", main h2, main h3, main p, main img",
      );
      elements.forEach((element) => {
        // 親子を同時に動かさず、カードや文章のまとまりを保つ。
        if (element.closest("dialog, .swiper-wrapper, .visually-hidden, [aria-hidden='true']") ||
            element.parentElement.closest(groups)) return;
        if (!element.hasAttribute("data-reveal") &&
            element.parentElement.closest(".advance-form__row")) return;
        const distance = compact.matches ? 24 : 42;
        directions.set(element, element.dataset.reveal === "right" ? `${distance}px 0` :
          element.dataset.reveal === "left" ? `${-distance}px 0` : `0 ${distance}px`);
        element.classList.add("motion-reveal-pending");
        pending.add(element);
        candidates.push(element);
      });
    };
    let observing = false;
    const observeWhenReady = () => {
      if (observing || reducedMotion.matches || document.body.matches(".is-loading, .is-page-entering")) return;
      observing = true;
      candidates.forEach((element) => observer.observe(element));
    };
    prepare();
    // キーボードで移動した入力欄やリンクも、非表示のままにしない。
    document.addEventListener("focusin", (event) => {
      const element = event.target.closest?.(".motion-reveal-pending");
      if (!element) return;
      observer.unobserve(element);
      element.classList.remove("motion-reveal-pending");
      pending.delete(element);
      element.getAnimations().forEach((animation) => {
        if (!animations.has(animation)) return;
        animations.delete(animation);
        animation.cancel();
      });
    });
    if (document.body.matches(".is-loading, .is-page-entering")) {
      document.addEventListener("elevate:opening-complete", observeWhenReady, { once: true });
      document.addEventListener("elevate:page-transition-complete", observeWhenReady, { once: true });
    } else {
      observeWhenReady();
    }

    reducedMotion.addEventListener("change", (event) => {
      if (!event.matches) return;
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      pending.forEach((element) => element.classList.remove("motion-reveal-pending"));
      pending.clear();
    });
  };

  const initHeroTitleMotion = () => {
    const title = document.querySelector("main h1");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!title || title.closest("[data-reveal]") || reducedMotion.matches || !Element.prototype.animate) return;

    let animation;
    title.classList.add("motion-hero-pending");
    const play = () => {
      if (animation || reducedMotion.matches) return;
      title.classList.add("motion-hero-title");
      animation = title.animate(
        [
          { opacity: 0, translate: "0 24px" },
          { opacity: 1, translate: "0 0" },
        ],
        {
          duration: 820,
          delay: 70,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        },
      );
      animation.addEventListener("finish", () => {
        title.classList.remove("motion-hero-pending");
        animation.cancel();
      }, { once: true });
    };

    const playWhenReady = () => {
      if (document.body.matches(".is-loading, .is-page-entering")) return;
      play();
    };
    if (document.body.matches(".is-loading, .is-page-entering")) {
      document.addEventListener("elevate:opening-complete", playWhenReady, { once: true });
      document.addEventListener("elevate:page-transition-complete", playWhenReady, { once: true });
    } else {
      requestAnimationFrame(play);
    }
    reducedMotion.addEventListener("change", (event) => {
      if (!event.matches) return;
      animation?.cancel();
      title.classList.remove("motion-hero-pending");
      title.classList.remove("motion-hero-title");
    }, { once: true });
  };



  const initPointerParallax = () => {
    const media = window.matchMedia(
      "(min-width: 768px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let cleanup;
    const sync = () => {
      cleanup?.();
      cleanup = undefined;
      if (!media.matches) return;
      const controller = new AbortController();
      const options = { signal: controller.signal, passive: true };
      const decorations = [...document.querySelectorAll(".floating-background__orb, .dx-orb")];
      if (!decorations.length) return;
      let frame = 0;
      let x = 0;
      let y = 0;
      let targetX = 0;
      let targetY = 0;
      const draw = () => {
        x += (targetX - x) * 0.075;
        y += (targetY - y) * 0.075;
        decorations.forEach((decoration, index) => {
          const depth = 0.45 + (index % 4) * 0.24;
          decoration.style.setProperty("--orb-pointer-x", `${(x * depth).toFixed(2)}px`);
          decoration.style.setProperty("--orb-pointer-y", `${(y * depth).toFixed(2)}px`);
        });
        if (Math.hypot(targetX - x, targetY - y) < 0.08) {
          x = targetX;
          y = targetY;
          frame = 0;
          return;
        }
        frame = requestAnimationFrame(draw);
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
      window.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "mouse") return;
        targetX = (event.clientX / window.innerWidth - 0.5) * 28;
        targetY = (event.clientY / window.innerHeight - 0.5) * 22;
        schedule();
      }, options);
      document.documentElement.addEventListener("pointerleave", () => {
        targetX = 0;
        targetY = 0;
        schedule();
      }, options);
      cleanup = () => {
        controller.abort();
        cancelAnimationFrame(frame);
        decorations.forEach((decoration) => {
          decoration.style.removeProperty("--orb-pointer-x");
          decoration.style.removeProperty("--orb-pointer-y");
        });
      };
    };
    sync();
    media.addEventListener("change", sync);
  };


  const initPageTransitions = () => {
    const storageKey = "elevate:page-transition";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches || !Element.prototype.animate) {
      try { sessionStorage.removeItem(storageKey); } catch { /* 保存不可の場合は何もしない。 */ }
      return;
    }

    const layer = document.createElement("div");
    const mark = document.createElement("span");
    layer.className = "page-transition";
    layer.setAttribute("aria-hidden", "true");
    mark.className = "page-transition__mark";
    mark.textContent = "ELEVATE";
    layer.append(mark);
    document.body.append(layer);
    let leaving = false;
    let navigated = false;
    let pendingHref = "";
    let navigationTimer;

    const activate = () => layer.classList.add("is-active");
    const deactivate = () => {
      layer.getAnimations().forEach(animation => animation.cancel());
      mark.getAnimations().forEach(animation => animation.cancel());
      layer.classList.remove("is-active");
      layer.style.removeProperty("opacity");
      const wasEntering = document.body.classList.contains("is-page-entering");
      document.body.classList.remove("is-page-entering", "is-page-leaving");
      leaving = false;
      navigated = false;
      pendingHref = "";
      clearTimeout(navigationTimer);
      if (wasEntering) document.dispatchEvent(new Event("elevate:page-transition-complete"));
    };
    const animateMark = () => mark.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 180, easing: "ease-out", fill: "both" },
    );

    let arrivedFromTransition = false;
    try {
      arrivedFromTransition = sessionStorage.getItem(storageKey) === "1";
      if (arrivedFromTransition) sessionStorage.removeItem(storageKey);
    } catch {
      arrivedFromTransition = false;
    }
    if (arrivedFromTransition) {
      document.body.classList.add("is-page-entering");
      activate();
      layer.style.opacity = "1";
      const entry = layer.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 350, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
      );
      entry.addEventListener("finish", deactivate, { once: true });
    }

    const canTransition = (event, anchor) => {
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey || anchor.hasAttribute("download") ||
          (anchor.target && anchor.target !== "_self") || anchor.matches("[data-no-transition]")) return false;
      const url = new URL(anchor.href, window.location.href);
      if (!["http:", "https:", "file:"].includes(url.protocol) || url.origin !== window.location.origin) return false;
      if (url.href === window.location.href) return false;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;
      return true;
    };
    document.addEventListener("click", (event) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!canTransition(event, anchor) || leaving) return;
      event.preventDefault();
      leaving = true;
      pendingHref = anchor.href;
      document.body.classList.add("is-page-leaving");
      activate();
      animateMark();
      const cover = layer.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 180, easing: "ease-out", fill: "forwards" },
      );
      const navigate = () => {
        if (navigated || !pendingHref) return;
        navigated = true;
        clearTimeout(navigationTimer);
        try { sessionStorage.setItem(storageKey, "1"); } catch { /* 保存不可でも遷移は続ける。 */ }
        window.location.assign(pendingHref);
      };
      cover.addEventListener("finish", navigate, { once: true });
      navigationTimer = window.setTimeout(navigate, 650);
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted || leaving) deactivate();
    });
    reducedMotion.addEventListener("change", (event) => {
      if (!event.matches) return;
      if (leaving) {
        navigated = true;
        clearTimeout(navigationTimer);
        window.location.assign(pendingHref);
      } else {
        deactivate();
      }
    });
  };

  const initPointerEffects = () => {
    const media = window.matchMedia(
      "(min-width: 768px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let cleanup;
    const sync = () => {
      cleanup?.();
      cleanup = undefined;
      if (!media.matches || !Element.prototype.animate) return;

      const controller = new AbortController();
      const options = { signal: controller.signal, passive: true };
      const layer = document.createElement("div");
      layer.className = "pointer-effects";
      layer.setAttribute("aria-hidden", "true");
      const follower = document.createElement("div");
      follower.className = "pointer-follower";
      const dot = document.createElement("div");
      dot.className = "pointer-dot";
      layer.append(follower, dot);
      document.body.append(layer);
      const ripples = new Map();
      let frame = 0;
      let lastTime = 0;
      let visible = false;
      let x = 0;
      let y = 0;
      let targetX = 0;
      let targetY = 0;
      const hide = () => {
        visible = false;
        follower.classList.remove("is-visible", "is-interactive");
        dot.classList.remove("is-visible", "is-interactive");
        document.documentElement.classList.remove("has-custom-pointer");
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
      };
      const draw = (time) => {
        const elapsed = lastTime ? Math.min(time - lastTime, 64) : 16;
        lastTime = time;
        const ease = 1 - Math.exp(-elapsed / 65);
        x += (targetX - x) * ease;
        y += (targetY - y) * ease;
        const settled = Math.hypot(targetX - x, targetY - y) < 0.1;
        if (settled) { x = targetX; y = targetY; }
        follower.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        frame = settled ? 0 : requestAnimationFrame(draw);
        if (settled) lastTime = 0;
      };
      const blocked = (target) => (
        !(target instanceof Element) ||
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), iframe, dialog[open]') ||
        document.querySelector("dialog[open]")
      );
      const move = (event) => {
        if (event.pointerType !== "mouse" || blocked(event.target)) { hide(); return; }
        targetX = event.clientX;
        targetY = event.clientY;
        dot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
        dot.classList.add("is-visible");
        document.documentElement.classList.add("has-custom-pointer");
        if (!visible) {
          x = targetX;
          y = targetY;
          follower.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          visible = true;
          follower.classList.add("is-visible");
        }
        follower.classList.toggle("is-interactive", Boolean(
          event.target.closest('a[href], button:not(:disabled), [role="button"], summary, label'),
        ));
        dot.classList.toggle("is-interactive", follower.classList.contains("is-interactive"));
        if (!frame) frame = requestAnimationFrame(draw);
      };
      const clearRipples = () => {
        ripples.forEach((animation, node) => { animation.cancel(); node.remove(); });
        ripples.clear();
      };
      document.addEventListener("pointermove", move, options);
      document.addEventListener("pointerover", move, options);
      document.addEventListener("pointerout", (event) => {
        if (!event.relatedTarget) hide();
      }, options);
      document.addEventListener("pointercancel", hide, options);
      window.addEventListener("blur", () => { hide(); clearRipples(); }, options);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) { hide(); clearRipples(); }
      }, options);
      document.addEventListener("scroll", () => {
        if (!visible) return;
        const target = document.elementFromPoint(targetX, targetY);
        if (blocked(target)) { hide(); return; }
        const interactive = Boolean(target.closest('a[href], button:not(:disabled), [role="button"], summary, label'));
        follower.classList.toggle("is-interactive", interactive);
        dot.classList.toggle("is-interactive", interactive);
      }, { ...options, capture: true });
      document.addEventListener("keydown", hide, options);
      document.addEventListener("click", (event) => {
        if (!event.detail || event.button !== 0 ||
            (event.pointerType && event.pointerType !== "mouse") || blocked(event.target)) return;
        if (ripples.size >= 6) {
          const [node, animation] = ripples.entries().next().value;
          animation.cancel();
          node.remove();
          ripples.delete(node);
        }
        const ripple = document.createElement("span");
        ripple.className = "pointer-ripple";
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        layer.append(ripple);
        const animation = ripple.animate([
          { transform: "translate(-50%, -50%) scale(0.25)", opacity: 0.75 },
          { transform: "translate(-50%, -50%) scale(1.5)", opacity: 0 },
        ], { duration: 580, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
        ripples.set(ripple, animation);
        animation.addEventListener("finish", () => {
          ripple.remove();
          ripples.delete(ripple);
        }, { once: true });
      }, options);
      // ネイティブdialogの表示中は、背景側の装飾を停止する。
      const observer = new MutationObserver(() => {
        if (document.querySelector("dialog[open]")) { hide(); clearRipples(); }
      });
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
      cleanup = () => {
        controller.abort();
        observer.disconnect();
        hide();
        clearRipples();
        layer.remove();
      };
    };
    sync();
    media.addEventListener("change", sync);
  };

  const initMascotGuides = () => {
    const mascots = document.querySelectorAll("[data-mascot-guide]");
    if (!mascots.length) return;
    const bubble = document.createElement("section");
    bubble.id = "mascot-guide";
    bubble.className = "mascot-guide";
    bubble.hidden = true;
    bubble.setAttribute("role", "region");
    bubble.setAttribute("aria-labelledby", "mascot-guide-title");
    bubble.innerHTML = '<strong id="mascot-guide-title"></strong><button class="mascot-guide__close" type="button" aria-label="案内を閉じる">×</button><p aria-live="polite"></p>';
    document.body.append(bubble);
    const title = bubble.querySelector("strong");
    const message = bubble.querySelector("p");
    let active = null;
    const close = (restoreFocus = false) => {
      if (!active) return;
      const trigger = active;
      trigger.setAttribute("aria-expanded", "false");
      trigger.closest(".elevate-mascot").classList.remove("is-speaking");
      active = null;
      bubble.hidden = true;
      if (restoreFocus) trigger.focus({ preventScroll: true });
    };
    const position = () => {
      if (!active) return;
      const rect = active.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) { close(); return; }
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.right - width));
      const above = rect.top >= height + 28;
      const top = above ? rect.top - height - 14 : rect.bottom + 14;
      bubble.style.left = `${left}px`;
      bubble.style.top = `${Math.max(16, Math.min(window.innerHeight - height - 16, top))}px`;
      bubble.style.setProperty("--tail-left", `${Math.max(24, Math.min(width - 24, rect.left + rect.width / 2 - left))}px`);
      bubble.dataset.side = above ? "above" : "below";
    };
    const names = { ere: "エレ", sapo: "サポ", miru: "ミル", chare: "チャレ" };
    mascots.forEach((mascot) => {
      const img = mascot.querySelector("img");
      if (!img) return;
      const key = img.getAttribute("src").split("/").pop().replace(".png", "");
      const name = names[key] || "キャラクター";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mascot-trigger";
      button.setAttribute("aria-label", `${name}にこのページの案内を聞く`);
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", bubble.id);
      const hint = document.createElement("span");
      hint.className = "mascot-trigger__hint";
      hint.textContent = "このページをご案内";
      hint.setAttribute("aria-hidden", "true");
      button.append(img, hint);
      mascot.append(button);
      mascot.removeAttribute("aria-hidden");
      mascot.classList.add("has-guide");
      button.addEventListener("click", () => {
        if (active === button) { close(); return; }
        close();
        active = button;
        title.textContent = `${name}のページ案内`;
        message.textContent = mascot.dataset.mascotGuide;
        bubble.hidden = false;
        button.setAttribute("aria-expanded", "true");
        mascot.classList.add("is-speaking");
        position();
      });
    });
    bubble.querySelector("button").addEventListener("click", () => close(true));
    document.addEventListener("click", (event) => {
      if (active && !active.contains(event.target) && !bubble.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && active) { event.preventDefault(); close(true); }
    });
    document.addEventListener("focusin", (event) => {
      if (active && !active.contains(event.target) && !bubble.contains(event.target)) close();
    });
    window.addEventListener("scroll", position, { passive: true });
    window.addEventListener("resize", position);
    window.addEventListener("pagehide", () => close());
  };

  updateCurrentYear();
  initMascotGuides();
  initStickyHeader();
  initMenu();
  initServiceMenu();
  initPageTransitions();
  initHeroTitleMotion();
  initRevealAnimations();
  initPointerParallax();
  initPointerEffects();
  document.documentElement.classList.remove("motion-booting");
})();
