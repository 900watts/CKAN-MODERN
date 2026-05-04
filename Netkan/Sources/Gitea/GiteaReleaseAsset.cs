using System;

using Newtonsoft.Json;

namespace CKAN.NetKAN.Sources.Gitea
{
    public sealed class GiteaReleaseAsset
    {
        [JsonProperty("name")]
        public string? Name { get; set; }

        [JsonProperty("browser_download_url")]
        public Uri? Download { get; set; }

        [JsonProperty("created_at")]
        public DateTime? Created { get; set; }
    }
}
