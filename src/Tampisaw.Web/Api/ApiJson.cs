using System.Text.Json;
using System.Text.Json.Serialization;

namespace Tampisaw.Api;

/// <summary>JSON rules shared by the API: camelCase names (as the React app expects) and no nulls on output.</summary>
public static class ApiJson
{
    public static readonly JsonSerializerOptions Options = Create();

    private static JsonSerializerOptions Create()
    {
        var o = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            NumberHandling = JsonNumberHandling.AllowReadingFromString,
        };
        return o;
    }
}
