using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CKAN.NetKAN.Sources.Gitea
{
    public sealed class GiteaRepo
    {
        [JsonProperty("name")]
        public string? Name { get; set; }

        [JsonProperty("full_name")]
        public string? FullName { get; set; }

        [JsonProperty("html_url")]
        public string? HtmlUrl { get; set; }

        [JsonProperty("description")]
        public string? Description { get; set; }

        [JsonProperty("website")]
        public string? Website { get; set; }

        [JsonProperty("owner")]
        public GiteaUser? Owner { get; set; }

        [JsonProperty("has_issues")]
        public bool HasIssues { get; set; }

        [JsonProperty("has_wiki")]
        public bool HasWiki { get; set; }

        [JsonProperty("archived")]
        public bool Archived { get; set; }

        public JObject Resources => new JObject()
        {
            { "homepage",   Website },
            { "repository", HtmlUrl },
            { "bugtracker", HasIssues ? $"{HtmlUrl}/issues" : null },
            { "manual",     HasWiki   ? $"{HtmlUrl}/wiki"   : null },
        };
    }

    public sealed class GiteaUser
    {
        [JsonProperty("login")]
        public string? Login { get; set; }
    }
}
