(function () {
  if (!document.getElementById('ccode-bg')) {
    const bg = document.createElement('div');
    bg.id = 'ccode-bg';
    bg.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bg);
  }

  function getThemeName() {
    if (document.body.dataset && document.body.dataset.theme) {
      return document.body.dataset.theme;
    }
    const saved = window.localStorage.getItem('wtz-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function getThemeColors() {
    const theme = getThemeName();
    if (theme === 'dark') {
      return {
        bg: { r: 10, g: 10, b: 15, a: 255 },
        stroke: { r: 210, g: 214, b: 230 },
        dot: { r: 230, g: 234, b: 248 }
      };
    }
    return {
      bg: { r: 250, g: 250, b: 250, a: 255 },
      stroke: { r: 120, g: 120, b: 140 },
      dot: { r: 90, g: 90, b: 110 }
    };
  }

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/p5@1.11.1/lib/p5.min.js';
  script.onload = () => {
    new p5((p) => {
      let nodes = [];
      const nodeCount = 80;
      const maxDist = 120;

      p.setup = () => {
        const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
        canvas.parent('ccode-bg');
        for (let i = 0; i < nodeCount; i++) {
          nodes.push({
            x: p.random(p.width),
            y: p.random(p.height),
            vx: p.random(-0.5, 0.5),
            vy: p.random(-0.5, 0.5)
          });
        }
      };

      p.draw = () => {
        const colors = getThemeColors();
        p.background(colors.bg.r, colors.bg.g, colors.bg.b, colors.bg.a);

        nodes.forEach((n, i) => {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > p.width) n.vx *= -1;
          if (n.y < 0 || n.y > p.height) n.vy *= -1;

          for (let j = i + 1; j < nodes.length; j++) {
            let d = p.dist(n.x, n.y, nodes[j].x, nodes[j].y);
            if (d < maxDist) {
              p.stroke(colors.stroke.r, colors.stroke.g, colors.stroke.b, p.map(d, 0, maxDist, 150, 0));
              p.line(n.x, n.y, nodes[j].x, nodes[j].y);
            }
          }
          p.noStroke();
          p.fill(colors.dot.r, colors.dot.g, colors.dot.b, 220);
          p.circle(n.x, n.y, 3);
        });

        if (p.mouseX > 0 && p.mouseY > 0) {
          p.noFill();
          p.stroke(colors.stroke.r, colors.stroke.g, colors.stroke.b, 60);
          p.circle(p.mouseX, p.mouseY, 30);
        }
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    });
  };
  document.head.appendChild(script);
})();
