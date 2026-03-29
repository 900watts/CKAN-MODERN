using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CKAN.NetKAN.Sources.Github
{
    public sealed class GithubRepo
    {
        [JsonProperty("name")]
        public string? Name { get; set; }

        [JsonProperty("full_name")]
        public string? FullName { get; set; }

        [JsonProperty("html_url")]
        public string? HtmlUrl { get; set; }

        [JsonProperty("description")]
        public string? Description { get; set; }

        [JsonProperty("homepage")]
        public string? Homepage { get; set; }

        [JsonProperty("license")]
        public GithubLicense? License { get; set; }

        [JsonProperty("parent")]
        public GithubRepo? ParentRepo { get; set; }

        [JsonProperty("source")]
        public GithubRepo? SourceRepo { get; set; }

        [JsonProperty("owner")]
        public GithubUser? Owner { get; set; }

        [JsonProperty("has_issues")]
        public bool HasIssues { get; set; }

        [JsonProperty("has_discussions")]
        public bool HasDiscussions { get; set; }

        [JsonProperty("has_wiki")]
        public bool HasWiki { get; set; }

        [JsonProperty("archived")]
        public bool Archived { get; set; }

        [JsonIgnore]
        public JObject Resources => new JObject()
        {
            { "repository",  HtmlUrl  },
            { "homepage",    Net.NormalizeUri(Homepage ?? "") },
            // issues_url ends with {/number} which makes it kind of useless
            { "bugtracker",  HasIssues      ? $"{HtmlUrl}/issues"      : null },
            { "discussions", HasDiscussions ? $"{HtmlUrl}/discussions" : null },
            { "manual",      HasWiki        ? $"{HtmlUrl}/wiki"        : null },
        };
    }

    public class GithubLicense
    {
        [JsonProperty("spdx_id")]
        public string? Id;
    }

    public class GithubUser
    {
        [JsonProperty("login")]
        public string? Login { get; set; }

        [JsonProperty("type")]
        public GithubUserType? Type { get; set; } = GithubUserType.User;
    }

    public enum GithubUserType
    {
        User,
        Organization,
        Bot,
    }
}
