package net.knarcraft.stargate.command;

import net.knarcraft.stargate.Stargate;
import net.knarcraft.stargate.config.SGFormatBuilder;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

/**
 * This command represents the plugin's reload command
 */
public class CommandReload implements CommandExecutor {

    @Override
    public boolean onCommand(@NotNull CommandSender commandSender, @NotNull Command command, @NotNull String s,
                             @NotNull String[] args) {
        if (commandSender instanceof Player player) {
            if (!player.hasPermission("stargate.admin.reload")) {
                new SGFormatBuilder("Permission Denied").error(commandSender);
                return true;
            }
        }
        Stargate.getStargateConfig().reload(commandSender);
        return true;
    }

}
