using System.Collections.Specialized;
using Avalonia;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MeowBuBu.Editor.Models;

namespace MeowBuBu.Editor.ViewModels;

public enum EditorTool
{
    Select,
    Platform,
    SolidGround,
    Enemy,
    Fish,
    Heart,
    Boss,
    PlayerSpawn,
    Erase
}

public enum EditorObjectKind
{
    None,
    Platform,
    Enemy,
    Fish,
    Heart,
    Boss,
    PlayerSpawn
}

public partial class LevelEditorViewModel : ViewModelBase
{
    [ObservableProperty] private LevelData _level = LevelData.CreateDefault("level1", "森林", "forest", "normal", 2800);
    [ObservableProperty] private EditorTool _tool = EditorTool.Select;
    [ObservableProperty] private object? _selectedObject;
    [ObservableProperty] private EditorObjectKind _selectedKind = EditorObjectKind.None;
    [ObservableProperty] private double _zoom = 0.45;
    [ObservableProperty] private double _offsetX = 20;
    [ObservableProperty] private double _offsetY = 20;
    [ObservableProperty] private bool _showGrid = true;
    [ObservableProperty] private bool _snapToGrid = true;
    [ObservableProperty] private double _gridSize = 10;
    [ObservableProperty] private double _brushWidth = 120;
    [ObservableProperty] private double _brushHeight = 16;
    [ObservableProperty] private int _heartHeal = 1;
    [ObservableProperty] private string _statusText = "就緒";
    [ObservableProperty] private Point? _hoverWorld;
    [ObservableProperty] private string? _filePath;

    // 屬性面板綁定（選取平台時）
    [ObservableProperty] private double _propX;
    [ObservableProperty] private double _propY;
    [ObservableProperty] private double _propW;
    [ObservableProperty] private double _propH;
    [ObservableProperty] private bool _propOneWay;
    [ObservableProperty] private int _propHeal = 1;
    [ObservableProperty] private bool _hasSelection;
    [ObservableProperty] private bool _isPlatformSelected;
    [ObservableProperty] private bool _isHeartSelected;

    private bool _syncingProps;

    public string[] BgOptions { get; } = ["forest", "castle", "boss", "prologue"];
    public string[] DifficultyOptions { get; } = ["簡易", "普通", "困難"];
    public string[] TypeOptions { get; } = ["normal", "boss"];

    public LevelEditorViewModel()
    {
        HookLevel(Level);
    }

    partial void OnLevelChanged(LevelData value)
    {
        HookLevel(value);
        ClearSelection();
        OnPropertyChanged(nameof(PlatformCount));
        OnPropertyChanged(nameof(EnemyCount));
        OnPropertyChanged(nameof(FishCount));
        OnPropertyChanged(nameof(HeartCount));
    }

    private void HookLevel(LevelData level)
    {
        level.Platforms.CollectionChanged += OnCollectionsChanged;
        level.Enemies.CollectionChanged += OnCollectionsChanged;
        level.Fish.CollectionChanged += OnCollectionsChanged;
        level.Hearts.CollectionChanged += OnCollectionsChanged;
        level.PropertyChanged += (_, _) => NotifyCounts();
    }

    private void OnCollectionsChanged(object? sender, NotifyCollectionChangedEventArgs e) => NotifyCounts();

    private void NotifyCounts()
    {
        OnPropertyChanged(nameof(PlatformCount));
        OnPropertyChanged(nameof(EnemyCount));
        OnPropertyChanged(nameof(FishCount));
        OnPropertyChanged(nameof(HeartCount));
    }

    public int PlatformCount => Level.Platforms.Count;
    public int EnemyCount => Level.Enemies.Count;
    public int FishCount => Level.Fish.Count;
    public int HeartCount => Level.Hearts.Count;

    [RelayCommand]
    public void ResetView()
    {
        Zoom = 0.45;
        OffsetX = 20;
        OffsetY = 20;
    }

    public void ClearSelection()
    {
        SelectedObject = null;
        SelectedKind = EditorObjectKind.None;
        HasSelection = false;
        IsPlatformSelected = false;
        IsHeartSelected = false;
    }

    public void SelectAt(double wx, double wy)
    {
        // 優先點物件：Boss > 玩家 > 敵人 > 魚 > 愛心 > 平台
        if (Level.Boss is { } boss && HitPoint(boss.X, boss.Y, 80, 100, wx, wy))
        {
            SetSelection(boss, EditorObjectKind.Boss);
            return;
        }

        if (HitPoint(Level.PlayerSpawn.X, Level.PlayerSpawn.Y, 28, 36, wx, wy))
        {
            SetSelection(Level.PlayerSpawn, EditorObjectKind.PlayerSpawn);
            return;
        }

        for (var i = Level.Enemies.Count - 1; i >= 0; i--)
        {
            var e = Level.Enemies[i];
            if (HitPoint(e.X, e.Y, 28, 30, wx, wy))
            {
                SetSelection(e, EditorObjectKind.Enemy);
                return;
            }
        }

        for (var i = Level.Fish.Count - 1; i >= 0; i--)
        {
            var f = Level.Fish[i];
            if (HitPoint(f.X, f.Y, 24, 16, wx, wy))
            {
                SetSelection(f, EditorObjectKind.Fish);
                return;
            }
        }

        for (var i = Level.Hearts.Count - 1; i >= 0; i--)
        {
            var h = Level.Hearts[i];
            if (HitPoint(h.X, h.Y, 18, 16, wx, wy))
            {
                SetSelection(h, EditorObjectKind.Heart);
                return;
            }
        }

        for (var i = Level.Platforms.Count - 1; i >= 0; i--)
        {
            var p = Level.Platforms[i];
            if (wx >= p.X && wx <= p.X + p.W && wy >= p.Y && wy <= p.Y + p.H)
            {
                SetSelection(p, EditorObjectKind.Platform);
                return;
            }
        }

        ClearSelection();
    }

    private static bool HitPoint(double x, double y, double w, double h, double wx, double wy) =>
        wx >= x && wx <= x + w && wy >= y && wy <= y + h;

    private void SetSelection(object obj, EditorObjectKind kind)
    {
        SelectedObject = obj;
        SelectedKind = kind;
        HasSelection = true;
        IsPlatformSelected = kind == EditorObjectKind.Platform;
        IsHeartSelected = kind == EditorObjectKind.Heart;
        PullPropsFromSelection();
    }

    private void PullPropsFromSelection()
    {
        _syncingProps = true;
        try
        {
            switch (SelectedObject)
            {
                case PlatformEntity p:
                    PropX = p.X; PropY = p.Y; PropW = p.W; PropH = p.H; PropOneWay = p.OneWay;
                    break;
                case PointEntity pt:
                    PropX = pt.X; PropY = pt.Y;
                    break;
                case HeartEntity h:
                    PropX = h.X; PropY = h.Y; PropHeal = h.Heal;
                    break;
            }
        }
        finally
        {
            _syncingProps = false;
        }
    }

    partial void OnPropXChanged(double value) => PushPropsToSelection();
    partial void OnPropYChanged(double value) => PushPropsToSelection();
    partial void OnPropWChanged(double value) => PushPropsToSelection();
    partial void OnPropHChanged(double value) => PushPropsToSelection();
    partial void OnPropOneWayChanged(bool value) => PushPropsToSelection();
    partial void OnPropHealChanged(int value) => PushPropsToSelection();

    private void PushPropsToSelection()
    {
        if (_syncingProps || SelectedObject is null) return;
        switch (SelectedObject)
        {
            case PlatformEntity p:
                p.X = PropX; p.Y = PropY; p.W = Math.Max(8, PropW); p.H = Math.Max(4, PropH); p.OneWay = PropOneWay;
                break;
            case PointEntity pt:
                pt.X = PropX; pt.Y = PropY;
                break;
            case HeartEntity h:
                h.X = PropX; h.Y = PropY; h.Heal = Math.Clamp(PropHeal, 1, 2);
                break;
        }
        // 觸發畫布重繪（透過屬性變更通知外部訂閱）
        OnPropertyChanged(nameof(SelectedObject));
    }

    public void EraseAt(double wx, double wy)
    {
        SelectAt(wx, wy);
        DeleteSelected();
    }

    [RelayCommand]
    public void DeleteSelected()
    {
        if (SelectedObject is null) return;
        switch (SelectedKind)
        {
            case EditorObjectKind.Platform when SelectedObject is PlatformEntity p:
                Level.Platforms.Remove(p);
                break;
            case EditorObjectKind.Enemy when SelectedObject is PointEntity e:
                Level.Enemies.Remove(e);
                break;
            case EditorObjectKind.Fish when SelectedObject is PointEntity f:
                Level.Fish.Remove(f);
                break;
            case EditorObjectKind.Heart when SelectedObject is HeartEntity h:
                Level.Hearts.Remove(h);
                break;
            case EditorObjectKind.Boss:
                Level.Boss = null;
                break;
            case EditorObjectKind.PlayerSpawn:
                StatusText = "玩家出生點不可刪除，請改用「出生點」工具移動";
                return;
        }
        ClearSelection();
        StatusText = "已刪除選取物件";
        OnPropertyChanged(nameof(Level));
    }

    public void PlacePlatform(double x, double y, bool oneWay)
    {
        var p = new PlatformEntity
        {
            X = x,
            Y = y,
            W = BrushWidth,
            H = oneWay ? BrushHeight : Math.Max(BrushHeight, 40),
            OneWay = oneWay
        };
        Level.Platforms.Add(p);
        SetSelection(p, EditorObjectKind.Platform);
        StatusText = oneWay ? "已放置單向平台" : "已放置實心地面";
        OnPropertyChanged(nameof(Level));
    }

    public void PlaceEnemy(double x, double y)
    {
        var e = new PointEntity(x, y);
        Level.Enemies.Add(e);
        SetSelection(e, EditorObjectKind.Enemy);
        StatusText = "已放置敵人";
        OnPropertyChanged(nameof(Level));
    }

    public void PlaceFish(double x, double y)
    {
        var f = new PointEntity(x, y);
        Level.Fish.Add(f);
        SetSelection(f, EditorObjectKind.Fish);
        StatusText = "已放置魚";
        OnPropertyChanged(nameof(Level));
    }

    public void PlaceHeart(double x, double y)
    {
        var h = new HeartEntity { X = x, Y = y, Heal = HeartHeal };
        Level.Hearts.Add(h);
        SetSelection(h, EditorObjectKind.Heart);
        StatusText = $"已放置愛心 (heal={HeartHeal})";
        OnPropertyChanged(nameof(Level));
    }

    public void PlaceBoss(double x, double y)
    {
        Level.Boss = new PointEntity(x, y);
        Level.Type = "boss";
        SetSelection(Level.Boss, EditorObjectKind.Boss);
        StatusText = "已放置 Boss";
        OnPropertyChanged(nameof(Level));
    }

    public void PlacePlayerSpawn(double x, double y)
    {
        Level.PlayerSpawn.X = x;
        Level.PlayerSpawn.Y = y;
        SetSelection(Level.PlayerSpawn, EditorObjectKind.PlayerSpawn);
        StatusText = "已更新玩家出生點";
        OnPropertyChanged(nameof(Level));
    }

    [RelayCommand]
    private void SetTool(string? toolName)
    {
        if (Enum.TryParse<EditorTool>(toolName, out var t))
            Tool = t;
    }

    [RelayCommand]
    private void NewLevelTemplate(string? template)
    {
        Level = template switch
        {
            "forest" => LevelData.CreateDefault("level1", "森林", "forest", "normal", 2800),
            "castle" => LevelData.CreateDefault("level2", "城堡", "castle", "normal", 3500),
            "boss" => LevelData.CreateDefault("boss", "Boss 戰", "boss", "boss", 960),
            _ => LevelData.CreateDefault("level_new", "新關卡", "forest", "normal", 2000)
        };
        FilePath = null;
        ResetView();
        StatusText = $"已建立範本：{Level.Name}";
    }

    [RelayCommand]
    private void EnsureGround()
    {
        // 確保有一條全寬地面
        var ground = Level.Platforms.FirstOrDefault(p => !p.OneWay && p.Y >= Level.GroundY - 1);
        if (ground is null)
        {
            Level.Platforms.Insert(0, new PlatformEntity
            {
                X = 0,
                Y = Level.GroundY,
                W = Level.Width,
                H = 80,
                OneWay = false
            });
        }
        else
        {
            ground.X = 0;
            ground.Y = Level.GroundY;
            ground.W = Level.Width;
            ground.H = 80;
        }
        StatusText = "已同步地面平台";
        OnPropertyChanged(nameof(Level));
    }
}
