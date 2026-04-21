(function() {
  var img = new Image();
  img.onload = function() {
    try {
      var W = img.naturalWidth || 64;
      var H = img.naturalHeight || 64;

      // Canvas temporal para leer los píxeles originales
      var tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      var tctx = tmp.getContext('2d');
      tctx.drawImage(img, 0, 0);
      var data = tctx.getImageData(0, 0, W, H).data;

      // Bounding box de píxeles no transparentes
      var minX = W, minY = H, maxX = 0, maxY = 0;
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          if (data[(y * W + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Canvas final 64x64: dibuja solo la región del logo con margen de 4px
      var SIZE = 64, PAD = 4;
      var c = document.createElement('canvas');
      c.width = SIZE; c.height = SIZE;
      var ctx = c.getContext('2d');
      var cropW = maxX - minX + 1;
      var cropH = maxY - minY + 1;
      ctx.drawImage(img, minX, minY, cropW, cropH, PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2);

      // Colorear todos los píxeles no transparentes en blanco
      var imageData = ctx.getImageData(0, 0, SIZE, SIZE);
      var d = imageData.data;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 10) {
          d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      var dataUrl = c.toDataURL('image/png');
      document.querySelectorAll("link[rel*='icon']").forEach(function(el) { el.remove(); });
      var link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = dataUrl;
      document.head.appendChild(link);
    } catch(e) { console.warn('favicon-white error:', e); }
  };
  img.onerror = function() { console.warn('favicon-white: no se encontró /logonew.png'); };
  img.src = '/logonew.png';
})();
