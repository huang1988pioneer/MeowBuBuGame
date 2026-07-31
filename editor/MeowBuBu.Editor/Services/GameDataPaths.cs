namespace MeowBuBu.Editor.Services;

/// <summary>定位遊戲 data/ 目錄（相對編輯器執行檔或專案根）。</summary>
public static class GameDataPaths
{
    public static string? FindGameRoot()
    {
        // 1) 環境變數
        var env = Environment.GetEnvironmentVariable("MEOWBUBU_GAME_ROOT");
        if (!string.IsNullOrWhiteSpace(env) && Directory.Exists(env))
            return Path.GetFullPath(env);

        // 2) 從目前目錄往上找 game.js
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 8 && dir is not null; i++)
        {
            if (File.Exists(Path.Combine(dir.FullName, "game.js")))
                return dir.FullName;
            dir = dir.Parent;
        }

        // 3) 工作目錄
        var cwd = Directory.GetCurrentDirectory();
        if (File.Exists(Path.Combine(cwd, "game.js")))
            return Path.GetFullPath(cwd);

        return null;
    }

    public static string EnsureDataLayout(string gameRoot)
    {
        var data = Path.Combine(gameRoot, "data");
        Directory.CreateDirectory(data);
        Directory.CreateDirectory(Path.Combine(data, "levels"));
        Directory.CreateDirectory(Path.Combine(data, "scenes"));
        return data;
    }

    public static string LevelsDir(string gameRoot) => Path.Combine(gameRoot, "data", "levels");
    public static string ScenesDir(string gameRoot) => Path.Combine(gameRoot, "data", "scenes");
    public static string CampaignFile(string gameRoot) => Path.Combine(gameRoot, "data", "campaign.json");
}
