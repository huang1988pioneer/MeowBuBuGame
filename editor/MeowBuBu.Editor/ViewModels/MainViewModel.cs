using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform.Storage;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MeowBuBu.Editor.Models;
using MeowBuBu.Editor.Services;

namespace MeowBuBu.Editor.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    public LevelEditorViewModel LevelEditor { get; } = new();
    public CampaignEditorViewModel CampaignEditor { get; } = new();
    public SceneEditorViewModel SceneEditor { get; } = new();

    [ObservableProperty] private int _selectedTab;
    [ObservableProperty] private string _statusMessage = "喵布布編輯器就緒";
    [ObservableProperty] private string _gameRootDisplay = "（未偵測到遊戲根目錄）";

    private string? _gameRoot;

    public MainViewModel()
    {
        ResolveGameRoot();
    }

    private void ResolveGameRoot()
    {
        _gameRoot = GameDataPaths.FindGameRoot();
        GameRootDisplay = _gameRoot is null
            ? "（未偵測到遊戲根目錄 — 請用「匯出到 data/」時選擇）"
            : _gameRoot;
    }

    private static Window? GetMainWindow()
    {
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
            return desktop.MainWindow;
        return null;
    }

    private static async Task<IStorageFile?> OpenJsonFileAsync(string title)
    {
        var window = GetMainWindow();
        if (window is null) return null;
        var files = await window.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = title,
            AllowMultiple = false,
            FileTypeFilter =
            [
                new FilePickerFileType("JSON") { Patterns = ["*.json"] },
                FilePickerFileTypes.All
            ]
        });
        return files.Count > 0 ? files[0] : null;
    }

    private static async Task<IStorageFile?> SaveJsonFileAsync(string title, string suggestedName)
    {
        var window = GetMainWindow();
        if (window is null) return null;
        return await window.StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions
        {
            Title = title,
            SuggestedFileName = suggestedName,
            DefaultExtension = "json",
            FileTypeChoices =
            [
                new FilePickerFileType("JSON") { Patterns = ["*.json"] }
            ]
        });
    }

    // ── 關卡 ──

    [RelayCommand]
    private async Task OpenLevelAsync()
    {
        var file = await OpenJsonFileAsync("開啟關卡 JSON");
        if (file is null) return;
        try
        {
            var path = file.Path.LocalPath;
            LevelEditor.Level = await JsonDataService.LoadLevelAsync(path);
            LevelEditor.FilePath = path;
            LevelEditor.ResetView();
            SelectedTab = 0;
            StatusMessage = $"已開啟關卡：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"開啟失敗：{ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveLevelAsync()
    {
        try
        {
            var path = LevelEditor.FilePath;
            if (string.IsNullOrEmpty(path))
            {
                await SaveLevelAsAsync();
                return;
            }
            await JsonDataService.SaveLevelAsync(path, LevelEditor.Level);
            StatusMessage = $"已儲存關卡：{path}";
            LevelEditor.StatusText = "已儲存";
        }
        catch (Exception ex)
        {
            StatusMessage = $"儲存失敗：{ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveLevelAsAsync()
    {
        var suggested = string.IsNullOrWhiteSpace(LevelEditor.Level.Id)
            ? "level.json"
            : $"{LevelEditor.Level.Id}.json";
        var file = await SaveJsonFileAsync("另存關卡 JSON", suggested);
        if (file is null) return;
        try
        {
            var path = file.Path.LocalPath;
            await JsonDataService.SaveLevelAsync(path, LevelEditor.Level);
            LevelEditor.FilePath = path;
            StatusMessage = $"已另存關卡：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"另存失敗：{ex.Message}";
        }
    }

    // ── 戰役 ──

    [RelayCommand]
    private async Task OpenCampaignAsync()
    {
        var file = await OpenJsonFileAsync("開啟戰役 JSON");
        if (file is null) return;
        try
        {
            var path = file.Path.LocalPath;
            CampaignEditor.Campaign = await JsonDataService.LoadCampaignAsync(path);
            CampaignEditor.FilePath = path;
            CampaignEditor.SelectedStage = CampaignEditor.Campaign.Stages.FirstOrDefault();
            SelectedTab = 1;
            StatusMessage = $"已開啟戰役：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"開啟失敗：{ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveCampaignAsync()
    {
        try
        {
            var path = CampaignEditor.FilePath;
            if (string.IsNullOrEmpty(path))
            {
                await SaveCampaignAsAsync();
                return;
            }
            await JsonDataService.SaveCampaignAsync(path, CampaignEditor.Campaign);
            StatusMessage = $"已儲存戰役：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"儲存失敗：{ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveCampaignAsAsync()
    {
        var file = await SaveJsonFileAsync("另存戰役 JSON", "campaign.json");
        if (file is null) return;
        try
        {
            var path = file.Path.LocalPath;
            await JsonDataService.SaveCampaignAsync(path, CampaignEditor.Campaign);
            CampaignEditor.FilePath = path;
            StatusMessage = $"已另存戰役：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"另存失敗：{ex.Message}";
        }
    }

    // ── 場景 ──

    [RelayCommand]
    private async Task OpenSceneAsync()
    {
        var file = await OpenJsonFileAsync("開啟場景 JSON");
        if (file is null) return;
        try
        {
            var path = file.Path.LocalPath;
            SceneEditor.Scene = await JsonDataService.LoadSceneAsync(path);
            SceneEditor.FilePath = path;
            SceneEditor.SelectedText = SceneEditor.Scene.Texts.FirstOrDefault();
            SelectedTab = 2;
            StatusMessage = $"已開啟場景：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"開啟失敗：{ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveSceneAsync()
    {
        try
        {
            var path = SceneEditor.FilePath;
            if (string.IsNullOrEmpty(path))
            {
                await SaveSceneAsAsync();
                return;
            }
            await JsonDataService.SaveSceneAsync(path, SceneEditor.Scene);
            StatusMessage = $"已儲存場景：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"儲存失敗：{ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveSceneAsAsync()
    {
        var suggested = string.IsNullOrWhiteSpace(SceneEditor.Scene.Id)
            ? "scene.json"
            : $"{SceneEditor.Scene.Id}.json";
        var file = await SaveJsonFileAsync("另存場景 JSON", suggested);
        if (file is null) return;
        try
        {
            var path = file.Path.LocalPath;
            await JsonDataService.SaveSceneAsync(path, SceneEditor.Scene);
            SceneEditor.FilePath = path;
            StatusMessage = $"已另存場景：{path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"另存失敗：{ex.Message}";
        }
    }

    // ── 匯出整包到遊戲 data/ ──

    [RelayCommand]
    private async Task ExportAllToGameDataAsync()
    {
        ResolveGameRoot();
        if (_gameRoot is null)
        {
            var window = GetMainWindow();
            if (window is null)
            {
                StatusMessage = "無法取得視窗以選擇資料夾";
                return;
            }
            var folders = await window.StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
            {
                Title = "選擇遊戲根目錄（含 game.js 的資料夾）",
                AllowMultiple = false
            });
            if (folders.Count == 0) return;
            _gameRoot = folders[0].Path.LocalPath;
            GameRootDisplay = _gameRoot;
        }

        try
        {
            GameDataPaths.EnsureDataLayout(_gameRoot);

            // 儲存目前編輯中的關卡
            var levelPath = Path.Combine(GameDataPaths.LevelsDir(_gameRoot), $"{LevelEditor.Level.Id}.json");
            await JsonDataService.SaveLevelAsync(levelPath, LevelEditor.Level);
            LevelEditor.FilePath = levelPath;

            // 若預設戰役關卡檔不存在，一併產生範本
            await EnsureDefaultLevelsAsync(_gameRoot);

            var campaignPath = GameDataPaths.CampaignFile(_gameRoot);
            await JsonDataService.SaveCampaignAsync(campaignPath, CampaignEditor.Campaign);
            CampaignEditor.FilePath = campaignPath;

            var scenePath = Path.Combine(GameDataPaths.ScenesDir(_gameRoot), $"{SceneEditor.Scene.Id}.json");
            await JsonDataService.SaveSceneAsync(scenePath, SceneEditor.Scene);
            SceneEditor.FilePath = scenePath;

            StatusMessage = $"已匯出到 {_gameRoot}\\data\\ （campaign + levels + scenes）";
        }
        catch (Exception ex)
        {
            StatusMessage = $"匯出失敗：{ex.Message}";
        }
    }

    private static async Task EnsureDefaultLevelsAsync(string gameRoot)
    {
        var dir = GameDataPaths.LevelsDir(gameRoot);
        var defaults = new[]
        {
            LevelData.CreateDefault("level1", "森林", "forest", "normal", 2800),
            LevelData.CreateDefault("level2", "城堡", "castle", "normal", 3500),
            LevelData.CreateDefault("boss", "Boss 戰", "boss", "boss", 960)
        };
        foreach (var lv in defaults)
        {
            var path = Path.Combine(dir, $"{lv.Id}.json");
            if (!File.Exists(path))
                await JsonDataService.SaveLevelAsync(path, lv);
        }
    }

    [RelayCommand]
    private async Task LoadAllFromGameDataAsync()
    {
        ResolveGameRoot();
        if (_gameRoot is null || !Directory.Exists(Path.Combine(_gameRoot, "data")))
        {
            StatusMessage = "找不到 data/ 目錄，請先匯出或指定遊戲根目錄";
            return;
        }

        try
        {
            var campaignPath = GameDataPaths.CampaignFile(_gameRoot);
            if (File.Exists(campaignPath))
            {
                CampaignEditor.Campaign = await JsonDataService.LoadCampaignAsync(campaignPath);
                CampaignEditor.FilePath = campaignPath;
                CampaignEditor.SelectedStage = CampaignEditor.Campaign.Stages.FirstOrDefault();
            }

            var scenePath = Path.Combine(GameDataPaths.ScenesDir(_gameRoot), "prologue.json");
            if (File.Exists(scenePath))
            {
                SceneEditor.Scene = await JsonDataService.LoadSceneAsync(scenePath);
                SceneEditor.FilePath = scenePath;
                SceneEditor.SelectedText = SceneEditor.Scene.Texts.FirstOrDefault();
            }

            var level1 = Path.Combine(GameDataPaths.LevelsDir(_gameRoot), "level1.json");
            if (File.Exists(level1))
            {
                LevelEditor.Level = await JsonDataService.LoadLevelAsync(level1);
                LevelEditor.FilePath = level1;
                LevelEditor.ResetView();
            }

            StatusMessage = $"已從 {_gameRoot}\\data\\ 載入";
        }
        catch (Exception ex)
        {
            StatusMessage = $"載入失敗：{ex.Message}";
        }
    }
}
