using System;
using System.ComponentModel;

using Newtonsoft.Json;

using CKAN.Versioning;

namespace CKAN.NetKAN.Sources.Gitea
{
    public sealed class GiteaRelease
    {
        [JsonProperty("author")]
        public GiteaUser? Author { get; set; }

        [JsonProperty("tag_name")]
        public ModuleVersion? Tag { get; set; }

        [JsonProperty("prerelease")]
        [DefaultValue(false)]
        public bool PreRelease { get; set; } = false;

        [JsonProperty("published_at")]
        public DateTime? PublishedAt { get; set; }

        [JsonProperty("assets")]
        public GiteaReleaseAsset[]? Assets { get; set; }
    }
}
