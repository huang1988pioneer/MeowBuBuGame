using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

namespace MeowBuBu.Editor.Models;

/// <summary>點座標（玩家出生、敵人、道具等）。</summary>
public partial class PointEntity : ObservableObject
{
    [ObservableProperty] private double _x;
    [ObservableProperty] private double _y;

    public PointEntity() { }

    public PointEntity(double x, double y)
    {
        X = x;
        Y = y;
    }

    public PointEntity Clone() => new(X, Y);
}

/// <summary>平台矩形。</summary>
public partial class PlatformEntity : ObservableObject
{
    [ObservableProperty] private double _x;
    [ObservableProperty] private double _y;
    [ObservableProperty] private double _w = 120;
    [ObservableProperty] private double _h = 16;
    [ObservableProperty] private bool _oneWay = true;

    public PlatformEntity Clone() => new()
    {
        X = X, Y = Y, W = W, H = H, OneWay = OneWay
    };
}

/// <summary>補血愛心（heal: 1 小 / 2 大）。</summary>
public partial class HeartEntity : ObservableObject
{
    [ObservableProperty] private double _x;
    [ObservableProperty] private double _y;
    [ObservableProperty] private int _heal = 1;

    public HeartEntity Clone() => new() { X = X, Y = Y, Heal = Heal };
}

/// <summary>關卡／地圖資料（與 game.js data/levels/*.json 對應）。</summary>
public partial class LevelData : ObservableObject
{
    [ObservableProperty] private string _id = "level1";
    [ObservableProperty] private string _name = "新關卡";
    [ObservableProperty] private double _width = 2800;
    [ObservableProperty] private double _groundY = 490;
    [ObservableProperty] private string _bg = "forest";
    [ObservableProperty] private string _difficulty = "普通";
    /// <summary>normal | boss</summary>
    [ObservableProperty] private string _type = "normal";
    [ObservableProperty] private PointEntity _playerSpawn = new(80, 400);
    [ObservableProperty] private PointEntity? _boss;

    public ObservableCollection<PlatformEntity> Platforms { get; set; } = new();
    public ObservableCollection<PointEntity> Enemies { get; set; } = new();
    public ObservableCollection<PointEntity> Fish { get; set; } = new();
    public ObservableCollection<HeartEntity> Hearts { get; set; } = new();

    public LevelData CloneShallowMeta() => new()
    {
        Id = Id,
        Name = Name,
        Width = Width,
        GroundY = GroundY,
        Bg = Bg,
        Difficulty = Difficulty,
        Type = Type,
        PlayerSpawn = PlayerSpawn.Clone(),
        Boss = Boss?.Clone()
    };

    public static LevelData CreateDefault(string id, string name, string bg, string type, double width)
    {
        var gy = 490.0;
        var level = new LevelData
        {
            Id = id,
            Name = name,
            Width = width,
            GroundY = gy,
            Bg = bg,
            Difficulty = "普通",
            Type = type,
            PlayerSpawn = new PointEntity(80, 400)
        };

        // 地面
        level.Platforms.Add(new PlatformEntity
        {
            X = 0, Y = gy, W = width, H = 80, OneWay = false
        });

        if (type == "boss")
        {
            level.Platforms.Add(new PlatformEntity { X = 180, Y = gy - 100, W = 160, H = 16, OneWay = true });
            level.Platforms.Add(new PlatformEntity { X = 620, Y = gy - 120, W = 160, H = 16, OneWay = true });
            level.Platforms.Add(new PlatformEntity { X = 400, Y = gy - 180, W = 130, H = 16, OneWay = true });
            level.Hearts.Add(new HeartEntity { X = 220, Y = gy - 140, Heal = 1 });
            level.Hearts.Add(new HeartEntity { X = 680, Y = gy - 160, Heal = 1 });
            level.Hearts.Add(new HeartEntity { X = 430, Y = gy - 220, Heal = 2 });
            level.Boss = new PointEntity(width - 250, gy - 100);
        }
        else
        {
            level.Platforms.Add(new PlatformEntity { X = 220, Y = gy - 70, W = 110, H = 16, OneWay = true });
            level.Platforms.Add(new PlatformEntity { X = 360, Y = gy - 110, W = 100, H = 16, OneWay = true });
            level.Fish.Add(new PointEntity(380, gy - 150));
            level.Fish.Add(new PointEntity(150, gy - 60));
            level.Hearts.Add(new HeartEntity { X = 260, Y = gy - 110, Heal = 1 });
            level.Hearts.Add(new HeartEntity { X = width * 0.35, Y = gy - 70, Heal = 1 });
            level.Hearts.Add(new HeartEntity { X = width * 0.65, Y = gy - 70, Heal = 2 });
            level.Enemies.Add(new PointEntity(500, gy - 30));
            level.Enemies.Add(new PointEntity(900, gy - 30));
        }

        return level;
    }
}

/// <summary>戰役關卡節點。</summary>
public partial class CampaignStage : ObservableObject
{
    [ObservableProperty] private string _levelId = "level1";
    [ObservableProperty] private string _state = "LEVEL1";
    [ObservableProperty] private string _label = "第 1 關";

    public CampaignStage Clone() => new()
    {
        LevelId = LevelId,
        State = State,
        Label = Label
    };
}

/// <summary>戰役資料（關卡順序）。</summary>
public partial class CampaignData : ObservableObject
{
    [ObservableProperty] private string _name = "喵布布的復仇";
    [ObservableProperty] private string _prologue = "prologue";
    public ObservableCollection<CampaignStage> Stages { get; set; } = new();

    public static CampaignData CreateDefault()
    {
        var c = new CampaignData
        {
            Name = "喵布布的復仇",
            Prologue = "prologue"
        };
        c.Stages.Add(new CampaignStage { LevelId = "level1", State = "LEVEL1", Label = "森林" });
        c.Stages.Add(new CampaignStage { LevelId = "level2", State = "LEVEL2", Label = "城堡" });
        c.Stages.Add(new CampaignStage { LevelId = "boss", State = "BOSS", Label = "Boss 戰" });
        return c;
    }
}

/// <summary>場景／序章資料。</summary>
public partial class SceneData : ObservableObject
{
    [ObservableProperty] private string _id = "prologue";
    [ObservableProperty] private string _name = "序章";
    [ObservableProperty] private string _bg = "prologue";
    public ObservableCollection<string> Texts { get; set; } = new();

    public static SceneData CreateDefaultPrologue()
    {
        var s = new SceneData
        {
            Id = "prologue",
            Name = "序章",
            Bg = "prologue"
        };
        foreach (var t in new[]
        {
            "喵布布的魚被人偷了...",
            "喵布布很火大！！",
            "決定要復仇！",
            "於是開始了一連串復仇之旅...",
            "目標只有一個：奪回屬於喵布布的一切！"
        })
            s.Texts.Add(t);
        return s;
    }
}

// ── JSON DTO（純資料，方便序列化） ──

public sealed class LevelDto
{
    public string Id { get; set; } = "level1";
    public string Name { get; set; } = "新關卡";
    public double Width { get; set; } = 2800;
    public double GroundY { get; set; } = 490;
    public string Bg { get; set; } = "forest";
    public string Difficulty { get; set; } = "普通";
    public string Type { get; set; } = "normal";
    public PointDto PlayerSpawn { get; set; } = new() { X = 80, Y = 400 };
    public List<PlatformDto> Platforms { get; set; } = new();
    public List<PointDto> Enemies { get; set; } = new();
    public List<PointDto> Fish { get; set; } = new();
    public List<HeartDto> Hearts { get; set; } = new();
    public PointDto? Boss { get; set; }
}

public sealed class PointDto
{
    public double X { get; set; }
    public double Y { get; set; }
}

public sealed class PlatformDto
{
    public double X { get; set; }
    public double Y { get; set; }
    public double W { get; set; }
    public double H { get; set; }
    public bool OneWay { get; set; } = true;
}

public sealed class HeartDto
{
    public double X { get; set; }
    public double Y { get; set; }
    public int Heal { get; set; } = 1;
}

public sealed class CampaignDto
{
    public string Name { get; set; } = "喵布布的復仇";
    public string Prologue { get; set; } = "prologue";
    public List<CampaignStageDto> Stages { get; set; } = new();
}

public sealed class CampaignStageDto
{
    public string LevelId { get; set; } = "level1";
    public string State { get; set; } = "LEVEL1";
    public string Label { get; set; } = "";
}

public sealed class SceneDto
{
    public string Id { get; set; } = "prologue";
    public string Name { get; set; } = "序章";
    public string Bg { get; set; } = "prologue";
    public List<string> Texts { get; set; } = new();
}

public static class DataMapper
{
    public static LevelDto ToDto(LevelData l) => new()
    {
        Id = l.Id,
        Name = l.Name,
        Width = l.Width,
        GroundY = l.GroundY,
        Bg = l.Bg,
        Difficulty = l.Difficulty,
        Type = l.Type,
        PlayerSpawn = new PointDto { X = l.PlayerSpawn.X, Y = l.PlayerSpawn.Y },
        Platforms = l.Platforms.Select(p => new PlatformDto
        {
            X = p.X, Y = p.Y, W = p.W, H = p.H, OneWay = p.OneWay
        }).ToList(),
        Enemies = l.Enemies.Select(e => new PointDto { X = e.X, Y = e.Y }).ToList(),
        Fish = l.Fish.Select(f => new PointDto { X = f.X, Y = f.Y }).ToList(),
        Hearts = l.Hearts.Select(h => new HeartDto { X = h.X, Y = h.Y, Heal = h.Heal }).ToList(),
        Boss = l.Boss is null ? null : new PointDto { X = l.Boss.X, Y = l.Boss.Y }
    };

    public static LevelData FromDto(LevelDto d)
    {
        var l = new LevelData
        {
            Id = d.Id,
            Name = d.Name,
            Width = d.Width,
            GroundY = d.GroundY,
            Bg = d.Bg,
            Difficulty = string.IsNullOrWhiteSpace(d.Difficulty) ? "普通" : d.Difficulty,
            Type = d.Type,
            PlayerSpawn = new PointEntity(d.PlayerSpawn.X, d.PlayerSpawn.Y),
            Boss = d.Boss is null ? null : new PointEntity(d.Boss.X, d.Boss.Y)
        };
        foreach (var p in d.Platforms)
            l.Platforms.Add(new PlatformEntity { X = p.X, Y = p.Y, W = p.W, H = p.H, OneWay = p.OneWay });
        foreach (var e in d.Enemies)
            l.Enemies.Add(new PointEntity(e.X, e.Y));
        foreach (var f in d.Fish)
            l.Fish.Add(new PointEntity(f.X, f.Y));
        foreach (var h in d.Hearts)
            l.Hearts.Add(new HeartEntity { X = h.X, Y = h.Y, Heal = h.Heal });
        return l;
    }

    public static CampaignDto ToDto(CampaignData c) => new()
    {
        Name = c.Name,
        Prologue = c.Prologue,
        Stages = c.Stages.Select(s => new CampaignStageDto
        {
            LevelId = s.LevelId,
            State = s.State,
            Label = s.Label
        }).ToList()
    };

    public static CampaignData FromDto(CampaignDto d)
    {
        var c = new CampaignData { Name = d.Name, Prologue = d.Prologue };
        foreach (var s in d.Stages)
            c.Stages.Add(new CampaignStage { LevelId = s.LevelId, State = s.State, Label = s.Label });
        return c;
    }

    public static SceneDto ToDto(SceneData s) => new()
    {
        Id = s.Id,
        Name = s.Name,
        Bg = s.Bg,
        Texts = s.Texts.ToList()
    };

    public static SceneData FromDto(SceneDto d)
    {
        var s = new SceneData { Id = d.Id, Name = d.Name, Bg = d.Bg };
        foreach (var t in d.Texts)
            s.Texts.Add(t);
        return s;
    }
}
