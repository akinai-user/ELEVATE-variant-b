"use strict";

(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
      if (started || document.body.matches(".is-loading, .is-page-entering")) return;
      started = true;
      wordmark.classList.add("is-ready");
      if (reducedMotion.matches || !Element.prototype.animate) return;
      wordmark.querySelectorAll("span").forEach((letter, index) => {
        const animation = letter.animate([
          { transform: "translateY(-100vh) rotate(-8deg)", opacity: 0 },
          { transform: "translateY(12px) rotate(2deg)", opacity: 0.14, offset: 0.76 },
          { transform: "translateY(0) rotate(0)", opacity: 0.07 },
        ], {
          duration: 1250,
          delay: index * 65,
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
    document.addEventListener("elevate:opening-complete", play);
    document.addEventListener("elevate:page-transition-complete", play);
    reducedMotion.addEventListener("change", (event) => { if (event.matches) settle(); });
    window.addEventListener("pageshow", (event) => { if (event.persisted) { started = true; settle(); } });
    play();
  };

  const initInterviewSlider = () => {
    const carousel = document.querySelector(".interview-slider");
    if (!carousel || !window.Swiper) return;

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
        prevSlideMessage: "前のインタビュー",
        nextSlideMessage: "次のインタビュー",
        paginationBulletMessage: "{{index}}枚目のインタビューを表示",
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

  const initInterviewModal = () => {
    const modal = document.querySelector("#interview-modal");
    const cards = document.querySelectorAll("[data-interview]");
    if (!modal || !cards.length) return;

    const stories = [
      ["自分に合った働き方を相談できる環境に魅力を感じました。これまでの経験を整理しながら、新しい仕事への一歩を踏み出せました。", "営業として、お客様の課題を聞き、必要な人材やサービスを提案しています。相手の立場に立って考えることを大切にしています。", "相談してよかったと言っていただけることが一番のやりがいです。これからも信頼される担当者を目指したいです。"],
      ["事務の経験を活かしながら、新しい業務にも挑戦したいと思い入社しました。相談しやすい雰囲気が後押しになりました。", "書類作成やデータ管理など、チームが円滑に働くためのサポートをしています。正確さと、周囲への気配りを心がけています。", "日々の小さな改善が、チーム全体の働きやすさにつながることに喜びを感じます。できることを少しずつ増やしていきたいです。"],
      ["技術を磨きながら、自分に合ったプロジェクトに関わりたいと考えました。これからのキャリアについて話せたことが決め手でした。", "システムの開発や改善に取り組んでいます。使う人の声を聞き、チームでアイデアを共有しながら形にしています。", "自分たちの開発した仕組みが役立つ瞬間に達成感があります。新しい技術を学び、より良い提案ができるよう成長したいです。"],
      ["人の挑戦を支える仕事に興味がありました。一人ひとりの希望に向き合う姿勢に共感しました。", "仕事を探している方へのヒアリングや、企業との調整を担当しています。希望や不安を丁寧に伺うことを大切にしています。", "新しい職場で活躍しているという報告が励みになります。人と企業の双方に安心して頼っていただける存在になりたいです。"],
      ["未経験の業務にも挑戦できる環境を探していました。段階的に仕事を覚えていけることに安心感がありました。", "営業チームの資料準備や進行管理をサポートしています。先を見て準備することと、こまめな情報共有を意識しています。", "以前は難しかった仕事を任せてもらえるようになり、自信がつきました。これからも一つずつ挑戦を重ねていきたいです。"],
    ];
    const questions = [
      "入社のきっかけを教えてください。",
      "現在のお仕事内容は？",
      "仕事のやりがいと今後の目標は？",
    ];
    const image = modal.querySelector(".interview-modal__image");
    const number = modal.querySelector("[data-modal-number]");
    const title = modal.querySelector("#interview-modal-title");
    const role = modal.querySelector(".interview-modal__role");
    const content = modal.querySelector(".interview-modal__content");
    let opener;

    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const index = Number(card.dataset.interview) - 1;
        const story = stories[index];
        const photo = card.querySelector("img");
        const heading = card.querySelector("h3");
        if (!story || !photo || !heading || !image || !number || !title || !role || !content) return;

        image.src = photo.src;
        image.alt = photo.alt;
        number.textContent = String(index + 1).padStart(2, "0");
        title.textContent = heading.textContent;
        role.textContent = [...card.querySelectorAll("p span")]
          .map((tag) => tag.textContent)
          .join(" / ");
        content.replaceChildren(...questions.flatMap((question, questionIndex) => {
          const questionHeading = document.createElement("h3");
          const answer = document.createElement("p");
          questionHeading.textContent = question;
          answer.textContent = story[questionIndex];
          return [questionHeading, answer];
        }));
        opener = card;
        modal.showModal();
        modal.scrollTop = 0;
        document.body.classList.add("modal-open");
      });
    });

    modal.querySelector(".interview-modal__close")?.addEventListener("click", () => modal.close());
    let backdropPointerDown = false;
    const isOutside = (event) => {
      const rect = modal.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    modal.addEventListener("pointerdown", (event) => {
      backdropPointerDown = isOutside(event);
    });
    modal.addEventListener("click", (event) => {
      if (backdropPointerDown && isOutside(event)) modal.close();
      backdropPointerDown = false;
    });
    modal.addEventListener("close", () => {
      document.body.classList.remove("modal-open");
      opener?.focus({ preventScroll: true });
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

  initHeroWordmark();
  initInterviewSlider();
  initInterviewModal();
  initBackToTop();
})();
