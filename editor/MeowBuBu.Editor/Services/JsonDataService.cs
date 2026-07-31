using System.Text.Json;
using System.Text.Json.Serialization;
using MeowBuBu.Editor.Models;

namespace MeowBuBu.Editor.Services;

public static class JsonDataService
{
    public static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static async Task SaveLevelAsync(string path, LevelData level)
    {
        var dto = DataMapper.ToDto(level);
        var json = JsonSerializer.Serialize(dto, Options);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, json);
    }

    public static async Task<LevelData> LoadLevelAsync(string path)
    {
        var json = await File.ReadAllTextAsync(path);
        var dto = JsonSerializer.Deserialize<LevelDto>(json, Options)
                  ?? throw new InvalidDataException("無法解析關卡 JSON");
        return DataMapper.FromDto(dto);
    }

    public static async Task SaveCampaignAsync(string path, CampaignData campaign)
    {
        var dto = DataMapper.ToDto(campaign);
        var json = JsonSerializer.Serialize(dto, Options);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, json);
    }

    public static async Task<CampaignData> LoadCampaignAsync(string path)
    {
        var json = await File.ReadAllTextAsync(path);
        var dto = JsonSerializer.Deserialize<CampaignDto>(json, Options)
                  ?? throw new InvalidDataException("無法解析戰役 JSON");
        return DataMapper.FromDto(dto);
    }

    public static async Task SaveSceneAsync(string path, SceneData scene)
    {
        var dto = DataMapper.ToDto(scene);
        var json = JsonSerializer.Serialize(dto, Options);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, json);
    }

    public static async Task<SceneData> LoadSceneAsync(string path)
    {
        var json = await File.ReadAllTextAsync(path);
        var dto = JsonSerializer.Deserialize<SceneDto>(json, Options)
                  ?? throw new InvalidDataException("無法解析場景 JSON");
        return DataMapper.FromDto(dto);
    }
}
