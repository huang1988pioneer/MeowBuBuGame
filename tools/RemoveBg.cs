// Compile: csc /r:System.Drawing.dll RemoveBg.cs
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.IO;

class RemoveBg {
    static int ProcessFile(string path, int darkThr, int maxChroma) {
        // Fully load into memory so file is not locked
        byte[] fileBytes = File.ReadAllBytes(path);
        Bitmap bmp;
        using (var ms = new MemoryStream(fileBytes))
        using (var src = new Bitmap(ms)) {
            int w = src.Width, h = src.Height;
            bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp)) {
                g.DrawImage(src, 0, 0, w, h);
            }
        }

        int w2 = bmp.Width, h2 = bmp.Height;
        var data = bmp.LockBits(new Rectangle(0, 0, w2, h2),
            ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        int bytes = Math.Abs(stride) * h2;
        byte[] px = new byte[bytes];
        Marshal.Copy(data.Scan0, px, 0, bytes);

        // BGRA
        Func<int, int, int> Idx = (x, y) => y * stride + x * 4;
        Func<int, bool> IsBg = i => {
            byte b = px[i], gch = px[i + 1], r = px[i + 2], a = px[i + 3];
            if (a < 10) return true;
            int max = Math.Max(r, Math.Max(gch, b));
            int min = Math.Min(r, Math.Min(gch, b));
            int avg = (r + gch + b) / 3;
            return avg <= darkThr && (max - min) <= maxChroma;
        };

        bool[] visited = new bool[w2 * h2];
        var q = new Queue<int>();
        Action<int, int> TrySeed = (x, y) => {
            int p = y * w2 + x;
            if (visited[p]) return;
            if (IsBg(Idx(x, y))) { visited[p] = true; q.Enqueue(p); }
        };
        for (int x = 0; x < w2; x++) { TrySeed(x, 0); TrySeed(x, h2 - 1); }
        for (int y = 0; y < h2; y++) { TrySeed(0, y); TrySeed(w2 - 1, y); }

        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        int cleared = 0;
        while (q.Count > 0) {
            int p = q.Dequeue();
            int x = p % w2, y = p / w2;
            int i = Idx(x, y);
            px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
            cleared++;
            for (int d = 0; d < 4; d++) {
                int nx = x + dx[d], ny = y + dy[d];
                if (nx < 0 || ny < 0 || nx >= w2 || ny >= h2) continue;
                int np = ny * w2 + nx;
                if (visited[np]) continue;
                visited[np] = true;
                if (IsBg(Idx(nx, ny))) q.Enqueue(np);
            }
        }

        // Soft edge for anti-aliased fringe
        for (int y = 1; y < h2 - 1; y++) {
            for (int x = 1; x < w2 - 1; x++) {
                int i = Idx(x, y);
                if (px[i + 3] == 0) continue;
                bool nearT = false;
                for (int d = 0; d < 4; d++) {
                    if (px[Idx(x + dx[d], y + dy[d]) + 3] == 0) { nearT = true; break; }
                }
                if (!nearT) continue;
                byte b = px[i], gch = px[i + 1], r = px[i + 2];
                int max = Math.Max(r, Math.Max(gch, b));
                int min = Math.Min(r, Math.Min(gch, b));
                int avg = (r + gch + b) / 3;
                if (avg < 80 && (max - min) < 48) {
                    px[i + 3] = (byte)Math.Max(0, Math.Min(255, (int)(avg / 80.0 * 180)));
                }
            }
        }

        Marshal.Copy(px, 0, data.Scan0, bytes);
        bmp.UnlockBits(data);

        // Save via MemoryStream then File.WriteAllBytes to avoid GDI file locks
        using (var ms = new MemoryStream()) {
            bmp.Save(ms, ImageFormat.Png);
            bmp.Dispose();
            File.WriteAllBytes(path, ms.ToArray());
        }
        return cleared;
    }

    static void Main(string[] args) {
        string outDir = args.Length > 0
            ? args[0]
            : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "assets", "sprites"));
        if (!Directory.Exists(outDir))
            outDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "assets", "sprites"));

        string[] targets = {
            "hero_idle","hero_walk1","hero_walk2","hero_walk3","hero_walk4","hero_run",
            "hero_attack1","hero_attack2","hero_hurt","hero_dead","hero_side",
            "enemy_idle","enemy_walk1","enemy_walk2","enemy_atk","enemy_hurt",
            "boss_idle1","boss_idle2","boss_idle3","boss_idle4",
            "boss_atk1","boss_atk2","boss_atk3","boss_atk4","boss_portrait",
            "fish_r1","fish_r2","fish_r3","fish_r4","fish_dead",
            "bullet_blue","bullet_purple","bullet_green","bullet_rocket"
        };
        Console.WriteLine("Out: " + outDir);
        foreach (var t in targets) {
            string p = Path.Combine(outDir, t + ".png");
            if (!File.Exists(p)) { Console.WriteLine("MISSING " + t); continue; }
            try {
                int n = ProcessFile(p, 55, 36);
                Console.WriteLine("Cleared " + n + " -> " + t + ".png");
            } catch (Exception ex) {
                Console.WriteLine("ERR " + t + ": " + ex.Message);
            }
        }
        Console.WriteLine("DONE");
    }
}
