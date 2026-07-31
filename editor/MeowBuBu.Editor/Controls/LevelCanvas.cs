using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using MeowBuBu.Editor.Models;
using MeowBuBu.Editor.ViewModels;

namespace MeowBuBu.Editor.Controls;

/// <summary>關卡地圖畫布：繪製、縮放、平移、放置／選取物件。</summary>
public class LevelCanvas : Control
{
    public static readonly StyledProperty<LevelEditorViewModel?> EditorProperty =
        AvaloniaProperty.Register<LevelCanvas, LevelEditorViewModel?>(nameof(Editor));

    public LevelEditorViewModel? Editor
    {
        get => GetValue(EditorProperty);
        set => SetValue(EditorProperty, value);
    }

    private bool _panning;
    private bool _dragging;
    private Point _lastPointer;
    private Point _dragStartWorld;
    private double _selStartX, _selStartY, _selStartW, _selStartH;

    private const double ViewW = 960;
    private const double ViewH = 540;

    static LevelCanvas()
    {
        AffectsRender<LevelCanvas>(EditorProperty);
        FocusableProperty.OverrideDefaultValue<LevelCanvas>(true);
    }

    public LevelCanvas()
    {
        ClipToBounds = true;
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == EditorProperty)
        {
            if (change.OldValue is LevelEditorViewModel oldVm)
                oldVm.PropertyChanged -= OnEditorPropertyChanged;
            if (change.NewValue is LevelEditorViewModel newVm)
                newVm.PropertyChanged += OnEditorPropertyChanged;
            InvalidateVisual();
        }
    }

    private void OnEditorPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        InvalidateVisual();
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);
        var bounds = Bounds;
        context.FillRectangle(new SolidColorBrush(Color.Parse("#1a1a24")), bounds);

        var ed = Editor;
        if (ed?.Level is null) return;
        var level = ed.Level;

        var zoom = ed.Zoom;
        var ox = ed.OffsetX;
        var oy = ed.OffsetY;

        using (context.PushTransform(Matrix.CreateScale(zoom, zoom) * Matrix.CreateTranslation(ox, oy)))
        {
            // 關卡範圍
            var levelRect = new Rect(0, 0, level.Width, ViewH);
            DrawBackground(context, level, levelRect);

            // 網格
            if (ed.ShowGrid)
                DrawGrid(context, level.Width, ViewH, ed.GridSize);

            // 攝影機可視框（參考）
            context.DrawRectangle(
                null,
                new Pen(new SolidColorBrush(Color.Parse("#4488ff88")), 2 / zoom),
                new Rect(0, 0, ViewW, ViewH));

            // 平台
            foreach (var p in level.Platforms)
            {
                var isSel = ReferenceEquals(ed.SelectedObject, p);
                var fill = p.OneWay
                    ? Color.Parse(isSel ? "#7acc4a" : "#4a8c2a")
                    : Color.Parse(isSel ? "#8a7a5a" : "#3a2415");
                var pen = new Pen(new SolidColorBrush(isSel ? Colors.Yellow : Colors.Black), isSel ? 2 / zoom : 1 / zoom);
                context.FillRectangle(new SolidColorBrush(fill), new Rect(p.X, p.Y, p.W, p.H));
                context.DrawRectangle(null, pen, new Rect(p.X, p.Y, p.W, p.H));
                if (p.OneWay)
                {
                    // 頂部標記
                    context.FillRectangle(new SolidColorBrush(Color.Parse("#8f8")), new Rect(p.X, p.Y, p.W, 3));
                }
            }

            // 敵人
            foreach (var e in level.Enemies)
            {
                var isSel = ReferenceEquals(ed.SelectedObject, e);
                DrawMarker(context, e.X, e.Y, 28, 30, Color.Parse("#e07040"), "敵", isSel, zoom);
            }

            // 魚
            foreach (var f in level.Fish)
            {
                var isSel = ReferenceEquals(ed.SelectedObject, f);
                DrawMarker(context, f.X, f.Y, 24, 16, Color.Parse("#44aaff"), "魚", isSel, zoom);
            }

            // 愛心
            foreach (var h in level.Hearts)
            {
                var isSel = ReferenceEquals(ed.SelectedObject, h);
                var c = h.Heal >= 2 ? Color.Parse("#ff6699") : Color.Parse("#ff3344");
                DrawMarker(context, h.X, h.Y, 18, 16, c, h.Heal >= 2 ? "♥2" : "♥", isSel, zoom);
            }

            // Boss
            if (level.Boss is { } boss)
            {
                var isSel = ReferenceEquals(ed.SelectedObject, boss);
                DrawMarker(context, boss.X, boss.Y, 80, 100, Color.Parse("#8844cc"), "Boss", isSel, zoom);
            }

            // 玩家出生
            {
                var s = level.PlayerSpawn;
                var isSel = ReferenceEquals(ed.SelectedObject, s) || ed.SelectedKind == EditorObjectKind.PlayerSpawn;
                DrawMarker(context, s.X, s.Y, 28, 36, Color.Parse("#66eeaa"), "P", isSel, zoom);
            }

            // 放置預覽
            if (ed.Tool is not EditorTool.Select and not EditorTool.Erase && ed.HoverWorld is { } hw)
            {
                var ghost = new SolidColorBrush(Color.Parse("#ffffff55"));
                switch (ed.Tool)
                {
                    case EditorTool.Platform:
                    case EditorTool.SolidGround:
                        context.FillRectangle(ghost, new Rect(hw.X, hw.Y, ed.BrushWidth, ed.BrushHeight));
                        break;
                    default:
                        context.FillRectangle(ghost, new Rect(hw.X, hw.Y, 24, 24));
                        break;
                }
            }
        }

        // HUD 提示（螢幕座標）
        var typeface = new Typeface("Segoe UI");
        var ft = new FormattedText(
            $"縮放 {ed.Zoom:0%}  |  網格 {ed.GridSize}  |  工具: {ToolLabel(ed.Tool)}  |  滾輪縮放 / 中鍵平移 / Delete 刪除",
            System.Globalization.CultureInfo.CurrentCulture,
            FlowDirection.LeftToRight,
            typeface,
            12,
            Brushes.White);
        context.FillRectangle(new SolidColorBrush(Color.Parse("#000000aa")), new Rect(8, bounds.Height - 28, ft.Width + 16, 22));
        context.DrawText(ft, new Point(16, bounds.Height - 26));
    }

    private static string ToolLabel(EditorTool t) => t switch
    {
        EditorTool.Select => "選取",
        EditorTool.Platform => "平台(單向)",
        EditorTool.SolidGround => "實心地面",
        EditorTool.Enemy => "敵人",
        EditorTool.Fish => "魚",
        EditorTool.Heart => "愛心",
        EditorTool.Boss => "Boss",
        EditorTool.PlayerSpawn => "出生點",
        EditorTool.Erase => "橡皮擦",
        _ => t.ToString()
    };

    private static void DrawBackground(DrawingContext ctx, LevelData level, Rect rect)
    {
        var colors = level.Bg switch
        {
            "forest" => (Color.Parse("#2a5530"), Color.Parse("#1a3020")),
            "castle" => (Color.Parse("#2a2a3a"), Color.Parse("#1a1a28")),
            "boss" => (Color.Parse("#0a1a30"), Color.Parse("#051018")),
            _ => (Color.Parse("#334455"), Color.Parse("#223344"))
        };
        ctx.FillRectangle(new SolidColorBrush(colors.Item1), rect);
        // 簡易地平線
        ctx.FillRectangle(new SolidColorBrush(colors.Item2),
            new Rect(0, level.GroundY, level.Width, Math.Max(0, ViewH - level.GroundY + 40)));
    }

    private static void DrawGrid(DrawingContext ctx, double w, double h, double step)
    {
        var pen = new Pen(new SolidColorBrush(Color.Parse("#ffffff18")), 1);
        for (double x = 0; x <= w; x += step)
            ctx.DrawLine(pen, new Point(x, 0), new Point(x, h));
        for (double y = 0; y <= h; y += step)
            ctx.DrawLine(pen, new Point(0, y), new Point(w, y));
    }

    private static void DrawMarker(DrawingContext ctx, double x, double y, double w, double h,
        Color color, string label, bool selected, double zoom)
    {
        var rect = new Rect(x, y, w, h);
        ctx.FillRectangle(new SolidColorBrush(color), rect);
        var pen = new Pen(new SolidColorBrush(selected ? Colors.Yellow : Colors.White), selected ? 2 / zoom : 1 / zoom);
        ctx.DrawRectangle(null, pen, rect);

        var ft = new FormattedText(
            label,
            System.Globalization.CultureInfo.CurrentCulture,
            FlowDirection.LeftToRight,
            new Typeface("Segoe UI", FontStyle.Normal, FontWeight.Bold),
            Math.Max(10, 11 / zoom * 0.5 + 9),
            Brushes.White);
        ctx.DrawText(ft, new Point(x + (w - ft.Width) / 2, y + (h - ft.Height) / 2));
    }

    private Point ScreenToWorld(Point screen)
    {
        var ed = Editor!;
        return new Point((screen.X - ed.OffsetX) / ed.Zoom, (screen.Y - ed.OffsetY) / ed.Zoom);
    }

    private static double Snap(double v, double grid, bool enable) =>
        enable ? Math.Round(v / grid) * grid : v;

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        base.OnPointerWheelChanged(e);
        var ed = Editor;
        if (ed is null) return;

        var pos = e.GetPosition(this);
        var before = ScreenToWorld(pos);
        var factor = e.Delta.Y > 0 ? 1.1 : 1 / 1.1;
        ed.Zoom = Math.Clamp(ed.Zoom * factor, 0.15, 4.0);
        // 以滑鼠位置為中心縮放
        ed.OffsetX = pos.X - before.X * ed.Zoom;
        ed.OffsetY = pos.Y - before.Y * ed.Zoom;
        InvalidateVisual();
        e.Handled = true;
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        Focus();
        var ed = Editor;
        if (ed?.Level is null) return;

        var props = e.GetCurrentPoint(this).Properties;
        var screen = e.GetPosition(this);
        _lastPointer = screen;
        var world = ScreenToWorld(screen);

        if (props.IsMiddleButtonPressed)
        {
            _panning = true;
            e.Pointer.Capture(this);
            e.Handled = true;
            return;
        }

        if (!props.IsLeftButtonPressed) return;

        world = new Point(
            Snap(world.X, ed.GridSize, ed.SnapToGrid),
            Snap(world.Y, ed.GridSize, ed.SnapToGrid));

        switch (ed.Tool)
        {
            case EditorTool.Select:
                ed.SelectAt(world.X, world.Y);
                if (ed.SelectedObject is not null)
                {
                    _dragging = true;
                    _dragStartWorld = world;
                    CaptureSelectionOrigin(ed);
                    e.Pointer.Capture(this);
                }
                break;

            case EditorTool.Erase:
                ed.EraseAt(world.X, world.Y);
                break;

            case EditorTool.Platform:
                ed.PlacePlatform(world.X, world.Y, oneWay: true);
                break;

            case EditorTool.SolidGround:
                ed.PlacePlatform(world.X, world.Y, oneWay: false);
                break;

            case EditorTool.Enemy:
                ed.PlaceEnemy(world.X, world.Y);
                break;

            case EditorTool.Fish:
                ed.PlaceFish(world.X, world.Y);
                break;

            case EditorTool.Heart:
                ed.PlaceHeart(world.X, world.Y);
                break;

            case EditorTool.Boss:
                ed.PlaceBoss(world.X, world.Y);
                break;

            case EditorTool.PlayerSpawn:
                ed.PlacePlayerSpawn(world.X, world.Y);
                break;
        }

        InvalidateVisual();
        e.Handled = true;
    }

    private void CaptureSelectionOrigin(LevelEditorViewModel ed)
    {
        switch (ed.SelectedObject)
        {
            case PlatformEntity p:
                _selStartX = p.X; _selStartY = p.Y; _selStartW = p.W; _selStartH = p.H;
                break;
            case PointEntity pt:
                _selStartX = pt.X; _selStartY = pt.Y;
                break;
            case HeartEntity h:
                _selStartX = h.X; _selStartY = h.Y;
                break;
        }
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        var ed = Editor;
        if (ed is null) return;

        var screen = e.GetPosition(this);
        var world = ScreenToWorld(screen);
        ed.HoverWorld = new Point(
            Snap(world.X, ed.GridSize, ed.SnapToGrid),
            Snap(world.Y, ed.GridSize, ed.SnapToGrid));
        ed.StatusText = $"X={ed.HoverWorld.Value.X:0}  Y={ed.HoverWorld.Value.Y:0}";

        if (_panning)
        {
            var dx = screen.X - _lastPointer.X;
            var dy = screen.Y - _lastPointer.Y;
            ed.OffsetX += dx;
            ed.OffsetY += dy;
            _lastPointer = screen;
            InvalidateVisual();
            e.Handled = true;
            return;
        }

        if (_dragging && ed.SelectedObject is not null && e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            var wx = Snap(world.X, ed.GridSize, ed.SnapToGrid);
            var wy = Snap(world.Y, ed.GridSize, ed.SnapToGrid);
            var dx = wx - _dragStartWorld.X;
            var dy = wy - _dragStartWorld.Y;

            switch (ed.SelectedObject)
            {
                case PlatformEntity p:
                    p.X = _selStartX + dx;
                    p.Y = _selStartY + dy;
                    break;
                case PointEntity pt:
                    pt.X = _selStartX + dx;
                    pt.Y = _selStartY + dy;
                    break;
                case HeartEntity h:
                    h.X = _selStartX + dx;
                    h.Y = _selStartY + dy;
                    break;
            }
            InvalidateVisual();
            e.Handled = true;
            return;
        }

        InvalidateVisual();
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        _panning = false;
        _dragging = false;
        e.Pointer.Capture(null);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        var ed = Editor;
        if (ed is null) return;

        if (e.Key is Key.Delete or Key.Back)
        {
            ed.DeleteSelected();
            InvalidateVisual();
            e.Handled = true;
        }
        else if (e.Key == Key.D1) ed.Tool = EditorTool.Select;
        else if (e.Key == Key.D2) ed.Tool = EditorTool.Platform;
        else if (e.Key == Key.D3) ed.Tool = EditorTool.Enemy;
        else if (e.Key == Key.D4) ed.Tool = EditorTool.Fish;
        else if (e.Key == Key.D5) ed.Tool = EditorTool.Heart;
        else if (e.Key == Key.D6) ed.Tool = EditorTool.Boss;
        else if (e.Key == Key.D7) ed.Tool = EditorTool.PlayerSpawn;
        else if (e.Key == Key.D0) ed.Tool = EditorTool.Erase;
        else if (e.Key == Key.G) ed.ShowGrid = !ed.ShowGrid;
        else if (e.Key == Key.F && e.KeyModifiers.HasFlag(KeyModifiers.Control))
        {
            ed.ResetView();
            InvalidateVisual();
            e.Handled = true;
        }
    }
}
